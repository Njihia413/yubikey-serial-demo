'use client';

import { useState, useEffect } from 'react';

// Updated API interface
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export interface YubiKey {
    serial: number;
    version: string;
    form_factor: string;
    device_type: string;
    is_fips: boolean;
    is_sky: boolean;
}

export interface YubiKeyInfo extends YubiKey {
    id?: number;
    first_seen?: string;
    last_seen?: string;
    raw_info?: string;
}

export interface DatabaseStats {
    total_yubikeys: number;
    total_detections: number;
    recent_detections_24h: number;
}

export class YubiKeyAPI {
    static async listYubiKeys(autoSave: boolean = false): Promise<YubiKey[]> {
        const url = autoSave ?
            `${API_BASE_URL}/api/yubikeys?auto_save=true` :
            `${API_BASE_URL}/api/yubikeys`;

        const response = await fetch(url);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to list YubiKeys');
        }

        return data.yubikeys;
    }

    static async getYubiKeyInfo(serial: number, autoSave: boolean = false): Promise<YubiKeyInfo> {
        const url = autoSave ?
            `${API_BASE_URL}/api/yubikey/${serial}/info?auto_save=true` :
            `${API_BASE_URL}/api/yubikey/${serial}/info`;

        const response = await fetch(url);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to get YubiKey info');
        }

        return data.info;
    }

    static async saveYubiKey(serial: number): Promise<YubiKeyInfo> {
        const response = await fetch(`${API_BASE_URL}/api/yubikey/${serial}/save`, {
            method: 'POST'
        });
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to save YubiKey');
        }

        return data.info;
    }

    static async getDatabaseYubiKeys(): Promise<YubiKeyInfo[]> {
        const response = await fetch(`${API_BASE_URL}/api/database/yubikeys`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to get database YubiKeys');
        }

        return data.yubikeys;
    }

    static async getDatabaseStats(): Promise<DatabaseStats> {
        const response = await fetch(`${API_BASE_URL}/api/database/stats`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to get database stats');
        }

        return data.stats;
    }
}

export default function YubiKeyManager() {
    const [yubiKeys, setYubiKeys] = useState<YubiKey[]>([]);
    const [databaseKeys, setDatabaseKeys] = useState<YubiKeyInfo[]>([]);
    const [selectedKey, setSelectedKey] = useState<YubiKeyInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [stats, setStats] = useState<DatabaseStats | null>(null);
    const loadYubiKeys = async () => {
        setLoading(true);
        setError(null);

        try {
            const keys = await YubiKeyAPI.listYubiKeys(true); // Always auto-save
            setYubiKeys(keys);
            await loadDatabaseKeys(); // Reload database keys after auto-save
            await loadStats();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    const loadDatabaseKeys = async () => {
        try {
            const keys = await YubiKeyAPI.getDatabaseYubiKeys();
            setDatabaseKeys(keys);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        }
    };

    const loadStats = async () => {
        try {
            const statsData = await YubiKeyAPI.getDatabaseStats();
            setStats(statsData);
        } catch (err) {
            console.error('Failed to load stats:', err);
        }
    };

    const selectYubiKey = async (serial: number) => {
        try {
            const info = await YubiKeyAPI.getYubiKeyInfo(serial, true); // Always auto-save
            setSelectedKey(info);
            await loadDatabaseKeys(); // Reload database keys after auto-save
            await loadStats();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        }
    };


    useEffect(() => {
        loadYubiKeys();
        loadDatabaseKeys();
        loadStats();
    }, []);

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <h1 className="text-3xl font-bold mb-6 text-black">YubiKey Manager</h1>

            {/* Stats Dashboard */}
            {stats && (
                <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-blue-100 p-4 rounded-lg">
                        <h3 className="font-semibold text-blue-800">Total YubiKeys</h3>
                        <p className="text-2xl font-bold text-blue-600">{stats.total_yubikeys}</p>
                    </div>
                    <div className="bg-green-100 p-4 rounded-lg">
                        <h3 className="font-semibold text-green-800">Total Detections</h3>
                        <p className="text-2xl font-bold text-green-600">{stats.total_detections}</p>
                    </div>
                    <div className="bg-purple-100 p-4 rounded-lg">
                        <h3 className="font-semibold text-purple-800">Recent (24h)</h3>
                        <p className="text-2xl font-bold text-purple-600">{stats.recent_detections_24h}</p>
                    </div>
                </div>
            )}

            {/* Controls */}
            <div className="mb-6 flex gap-4 items-center">
                <button
                    onClick={() => loadYubiKeys()}
                    disabled={loading}
                    className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
                >
                    {loading ? 'Loading...' : 'Scan YubiKeys'}
                </button>

                <button
                    onClick={loadDatabaseKeys}
                    className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
                >
                    Refresh Database
                </button>
            </div>

            {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Currently Connected YubiKeys */}
                <div>
                    <h2 className="text-xl font-semibold mb-4 text-black">Currently Connected</h2>
                    {yubiKeys.length === 0 ? (
                        <p className="text-black">No YubiKeys found</p>
                    ) : (
                        <div className="space-y-2">
                            {yubiKeys.map((key) => (
                                <div
                                    key={key.serial}
                                    className={`${key.serial === selectedKey?.serial ? 'bg-blue-100 border-blue-300' : 'bg-white'} border rounded p-3 cursor-pointer hover:bg-gray-50`}
                                    onClick={() => selectYubiKey(key.serial)}
                                >
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="font-medium text-black">Serial: {key.serial}</div>
                                            <div className="text-sm text-black">
                                                {key.version} | {key.form_factor}
                                            </div>
                                            <div className="text-xs text-black mt-1">
                                                FIPS: {key.is_fips ? 'Yes' : 'No'} |
                                                SKY: {key.is_sky ? 'Yes' : 'No'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Database YubiKeys */}
                <div>
                    <h2 className="text-xl font-semibold mb-4 text-black">Database Records</h2>
                    {databaseKeys.length === 0 ? (
                        <p className="text-black">No YubiKeys in database</p>
                    ) : (
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                            {databaseKeys.map((key) => (
                                <div
                                    key={key.id}
                                    className="bg-white border rounded p-3"
                                >
                                    <div className="font-medium text-black">Serial: {key.serial}</div>
                                    <div className="text-sm text-black">
                                        {key.version} | {key.form_factor}
                                    </div>
                                    <div className="text-xs text-black mt-1">
                                        Last seen: {key.last_seen ? new Date(key.last_seen).toLocaleString() : 'Unknown'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Selected YubiKey Details */}
            {selectedKey && (
                <div className="mt-6">
                    <h2 className="text-xl font-semibold mb-4 text-black">YubiKey Details</h2>
                    <div className="border rounded p-4 bg-white shadow-md">
                        <div className="grid grid-cols-2 gap-4 text-black">
                            <div><strong>Serial:</strong> {selectedKey.serial}</div>
                            <div><strong>Version:</strong> {selectedKey.version}</div>
                            <div><strong>Form Factor:</strong> {selectedKey.form_factor}</div>
                            <div><strong>Device Type:</strong> {selectedKey.device_type}</div>
                            <div><strong>FIPS:</strong> {selectedKey.is_fips ? 'Yes' : 'No'}</div>
                            <div><strong>SKY:</strong> {selectedKey.is_sky ? 'Yes' : 'No'}</div>
                            {selectedKey.first_seen && (
                                <div><strong>First Seen:</strong> {new Date(selectedKey.first_seen).toLocaleString()}</div>
                            )}
                            {selectedKey.last_seen && (
                                <div><strong>Last Seen:</strong> {new Date(selectedKey.last_seen).toLocaleString()}</div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
