from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_session import Session
from flask_socketio import SocketIO, emit
import subprocess
import json
import logging
import os
from datetime import datetime, timedelta
from sqlalchemy import func
from threading import Lock
import time


app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*")

# Background task for monitoring YubiKeys
thread = None
thread_lock = Lock()
connected_clients = 0

# Database configuration
app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://postgres:postgres@localhost/yubikey_manager'
app.config['SESSION_TYPE'] = 'filesystem'
app.config['SESSION_PERMANENT'] = False
app.config['SESSION_USE_SIGNER'] = True
app.config['SESSION_COOKIE_SECURE'] = False  # Set to True in production with HTTPS
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'  # Use 'Strict' in production
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.urandom(32)

Session(app)
db = SQLAlchemy(app)
migrate = Migrate(app, db)


# YubiKey model
class YubiKey(db.Model):
    __tablename__ = 'yubikeys'

    id = db.Column(db.Integer, primary_key=True)
    serial = db.Column(db.BigInteger, unique=True, nullable=False)
    version = db.Column(db.String(50), nullable=True)
    form_factor = db.Column(db.String(50), nullable=True)
    device_type = db.Column(db.String(50), nullable=True)
    is_fips = db.Column(db.Boolean, default=False, nullable=False)
    is_sky = db.Column(db.Boolean, default=False, nullable=False)
    first_seen = db.Column(db.DateTime(timezone=True), default=func.now())
    last_seen = db.Column(db.DateTime(timezone=True), default=func.now())
    raw_info = db.Column(db.Text, nullable=True)

    # Relationship to detections
    detections = db.relationship('YubiKeyDetection', backref='yubikey', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'serial': self.serial,
            'version': self.version,
            'form_factor': self.form_factor,
            'device_type': self.device_type,
            'is_fips': self.is_fips,
            'is_sky': self.is_sky,
            'first_seen': self.first_seen.isoformat() if self.first_seen else None,
            'last_seen': self.last_seen.isoformat() if self.last_seen else None,
            'raw_info': self.raw_info
        }


# YubiKey Detection model (for tracking each time a YubiKey is detected)
class YubiKeyDetection(db.Model):
    __tablename__ = 'yubikey_detections'

    id = db.Column(db.Integer, primary_key=True)
    serial = db.Column(db.BigInteger, db.ForeignKey('yubikeys.serial'), nullable=False)
    detected_at = db.Column(db.DateTime(timezone=True), default=func.now())
    info_snapshot = db.Column(db.JSON, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'serial': self.serial,
            'detected_at': self.detected_at.isoformat() if self.detected_at else None,
            'info_snapshot': self.info_snapshot
        }


def save_yubikey_to_db(yubikey_info, raw_info):
    """Save or update YubiKey information in database"""
    try:
        # Check if YubiKey already exists
        existing_yubikey = YubiKey.query.filter_by(serial=yubikey_info['serial']).first()

        if existing_yubikey:
            # Update existing record
            existing_yubikey.version = yubikey_info.get('version', 'Unknown')
            existing_yubikey.form_factor = yubikey_info.get('form_factor', 'Unknown')
            existing_yubikey.device_type = yubikey_info.get('device_type', 'YubiKey')
            existing_yubikey.is_fips = yubikey_info.get('is_fips', False)
            existing_yubikey.is_sky = yubikey_info.get('is_sky', False)
            existing_yubikey.last_seen = func.now()
            existing_yubikey.raw_info = raw_info

            yubikey_record = existing_yubikey
        else:
            # Create new record
            yubikey_record = YubiKey(
                serial=yubikey_info['serial'],
                version=yubikey_info.get('version', 'Unknown'),
                form_factor=yubikey_info.get('form_factor', 'Unknown'),
                device_type=yubikey_info.get('device_type', 'YubiKey'),
                is_fips=yubikey_info.get('is_fips', False),
                is_sky=yubikey_info.get('is_sky', False),
                raw_info=raw_info
            )
            db.session.add(yubikey_record)

        # Create detection record
        detection = YubiKeyDetection(
            serial=yubikey_info['serial'],
            info_snapshot=yubikey_info
        )
        db.session.add(detection)

        db.session.commit()
        print(f"YubiKey {yubikey_info['serial']} saved to database")
        return yubikey_record

    except Exception as e:
        db.session.rollback()
        print(f"Database save error: {e}")
        raise e


def run_ykman_command(args):
    """Run ykman command and return output"""
    try:
        result = subprocess.run(['ykman'] + args,
                                capture_output=True,
                                text=True,
                                timeout=10)
        if result.returncode == 0:
            return result.stdout.strip()
        else:
            raise Exception(f"ykman error: {result.stderr.strip()}")
    except FileNotFoundError:
        raise Exception("ykman command not found. Please install yubikey-manager.")
    except subprocess.TimeoutExpired:
        raise Exception("ykman command timed out")


@app.route('/api/yubikeys', methods=['GET'])
def list_yubikeys():
    try:
        # Try to list devices with serials
        output = run_ykman_command(['list', '--serials'])
        auto_save = request.args.get('auto_save', 'false').lower() == 'true'

        if not output:
            return jsonify({
                'success': True,
                'yubikeys': [],
                'count': 0
            })

        # Parse serials (one per line)
        serials = [int(line.strip()) for line in output.split('\n') if line.strip()]

        yubikeys = []
        for serial in serials:
            try:
                # Get info for each device
                info_output = run_ykman_command(['--device', str(serial), 'info'])

                # Parse the info output
                info = parse_yubikey_info(info_output)
                info['serial'] = serial

                # Add FIPS and SKY detection
                info['is_fips'] = 'FIPS' in info_output
                info['is_sky'] = 'SKY' in info_output

                yubikeys.append(info)

                # Auto-save to database if requested
                if auto_save:
                    save_yubikey_to_db(info, info_output)

            except Exception as e:
                # If we can't get detailed info, add basic info
                basic_info = {
                    'serial': serial,
                    'version': 'Unknown',
                    'form_factor': 'Unknown',
                    'device_type': 'YubiKey',
                    'is_fips': False,
                    'is_sky': False
                }
                yubikeys.append(basic_info)

                if auto_save:
                    try:
                        save_yubikey_to_db(basic_info, str(e))
                    except:
                        pass

        return jsonify({
            'success': True,
            'yubikeys': yubikeys,
            'count': len(yubikeys)
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


def parse_yubikey_info(info_output):
    """Parse ykman info output into structured data"""
    info = {
        'version': 'Unknown',
        'form_factor': 'Unknown',
        'device_type': 'YubiKey'
    }

    lines = info_output.split('\n')
    for line in lines:
        line = line.strip()
        if line.startswith('Firmware version:'):
            info['version'] = line.split(':', 1)[1].strip()
        elif line.startswith('Form factor:'):
            info['form_factor'] = line.split(':', 1)[1].strip()
        elif line.startswith('Device type:'):
            info['device_type'] = line.split(':', 1)[1].strip()

    return info


@app.route('/api/yubikey/<int:serial>/info', methods=['GET'])
def get_yubikey_info(serial):
    try:
        # Get detailed info for specific device
        info_output = run_ykman_command(['--device', str(serial), 'info'])

        info = parse_yubikey_info(info_output)
        info['serial'] = serial

        # Add additional fields
        info['is_fips'] = 'FIPS' in info_output
        info['is_sky'] = 'SKY' in info_output

        # Auto-save to database
        auto_save = request.args.get('auto_save', 'false').lower() == 'true'
        if auto_save:
            save_yubikey_to_db(info, info_output)

        return jsonify({
            'success': True,
            'info': info
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404


@app.route('/api/yubikey/<int:serial>/save', methods=['POST'])
def save_yubikey(serial):
    """Manually save a specific YubiKey to database"""
    try:
        # Get detailed info for specific device
        info_output = run_ykman_command(['--device', str(serial), 'info'])

        info = parse_yubikey_info(info_output)
        info['serial'] = serial
        info['is_fips'] = 'FIPS' in info_output
        info['is_sky'] = 'SKY' in info_output

        # Save to database
        yubikey_record = save_yubikey_to_db(info, info_output)

        return jsonify({
            'success': True,
            'message': f'YubiKey {serial} saved to database',
            'info': yubikey_record.to_dict()
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/database/yubikeys', methods=['GET'])
def get_database_yubikeys():
    """Get all YubiKeys from database"""
    try:
        yubikeys = YubiKey.query.order_by(YubiKey.last_seen.desc()).all()

        return jsonify({
            'success': True,
            'yubikeys': [yk.to_dict() for yk in yubikeys],
            'count': len(yubikeys)
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/database/detections', methods=['GET'])
def get_detection_history():
    """Get detection history from database"""
    try:
        # Get recent detections with YubiKey info
        detections = db.session.query(YubiKeyDetection, YubiKey) \
            .join(YubiKey, YubiKeyDetection.serial == YubiKey.serial) \
            .order_by(YubiKeyDetection.detected_at.desc()) \
            .limit(100) \
            .all()

        result = []
        for detection, yubikey in detections:
            det_dict = detection.to_dict()
            det_dict['device_type'] = yubikey.device_type
            det_dict['form_factor'] = yubikey.form_factor
            result.append(det_dict)

        return jsonify({
            'success': True,
            'detections': result,
            'count': len(result)
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/database/stats', methods=['GET'])
def get_database_stats():
    """Get database statistics"""
    try:
        total_yubikeys = YubiKey.query.count()
        total_detections = YubiKeyDetection.query.count()

        # Get recent activity (last 24 hours)
        recent_detections = YubiKeyDetection.query.filter(
            YubiKeyDetection.detected_at >= datetime.now() - timedelta(hours=24)
        ).count()

        return jsonify({
            'success': True,
            'stats': {
                'total_yubikeys': total_yubikeys,
                'total_detections': total_detections,
                'recent_detections_24h': recent_detections
            }
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/yubikey/test', methods=['GET'])
def test_ykman():
    """Test endpoint to check if ykman is working"""
    try:
        version = run_ykman_command(['--version'])
        return jsonify({
            'success': True,
            'ykman_version': version,
            'message': 'ykman is working'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/database/test', methods=['GET'])
def test_database():
    """Test database connection"""
    try:
        # Test database connection by running a simple query
        result = db.session.execute(db.text("SELECT version();")).fetchone()

        return jsonify({
            'success': True,
            'message': 'Database connection successful',
            'postgres_version': result[0] if result else 'Unknown'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/database/init', methods=['POST'])
def init_database():
    """Initialize database tables"""
    try:
        db.create_all()
        return jsonify({
            'success': True,
            'message': 'Database tables created successfully'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


def yubikey_monitor_task():
    """Background task to monitor YubiKey connections."""
    previous_serials = set()
    while True:
        try:
            with app.app_context():
                # Get current YubiKeys
                output = run_ykman_command(['list', '--serials'])
                if output:
                    current_serials = set(int(s) for s in output.split('\n') if s.strip())
                else:
                    current_serials = set()

                # Check for changes
                if current_serials != previous_serials:
                    print(f"Change detected: {previous_serials} -> {current_serials}")
                    # Fetch full details for current keys
                    yubikeys = []
                    for serial in current_serials:
                        try:
                            info_output = run_ykman_command(['--device', str(serial), 'info'])
                            info = parse_yubikey_info(info_output)
                            info['serial'] = serial
                            info['is_fips'] = 'FIPS' in info_output
                            info['is_sky'] = 'SKY' in info_output
                            yubikeys.append(info)
                            save_yubikey_to_db(info, info_output)
                        except Exception as e:
                            print(f"Could not get info for {serial}: {e}")
                            yubikeys.append({'serial': serial, 'version': 'Unknown', 'form_factor': 'Unknown', 'device_type': 'YubiKey', 'is_fips': False, 'is_sky': False})

                    # Emit update to clients
                    socketio.emit('yubikeys_update', {'yubikeys': yubikeys})
                    previous_serials = current_serials

        except Exception as e:
            print(f"Error in monitor task: {e}")

        socketio.sleep(2)  # Check every 2 seconds


@socketio.on('connect')
def handle_connect():
    global thread, connected_clients
    with thread_lock:
        connected_clients += 1
        if thread is None:
            thread = socketio.start_background_task(yubikey_monitor_task)
            print("Started background task.")


@socketio.on('disconnect')
def handle_disconnect():
    global connected_clients
    with thread_lock:
        connected_clients -= 1
        print(f"Client disconnected. Remaining clients: {connected_clients}")


if __name__ == '__main__':
    # Create tables if they don't exist
    with app.app_context():
        db.create_all()

    socketio.run(app, debug=True, port=5000)