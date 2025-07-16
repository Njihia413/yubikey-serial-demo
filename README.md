# YubiKey Serial Demo Application

This project is a full-stack application designed to interact with YubiKeys, retrieve their information, and store it in a database. It consists of a Next.js frontend and a Flask backend.

## Table of Contents

- [YubiKey Serial Demo Application](#yubikey-serial-demo-application)
  - [Table of Contents](#table-of-contents)
  - [Project Overview](#project-overview)
  - [Features](#features)
  - [Screenshots](#screenshots)
  - [Frontend (Next.js)](#frontend-nextjs)
    - [Technologies Used](#technologies-used)
    - [Setup and Installation](#setup-and-installation)
    - [Running the Frontend](#running-the-frontend)
  - [Backend (Flask)](#backend-flask)
    - [Technologies Used](#technologies-used-1)
    - [Setup and Installation](#setup-and-installation-1)
    - [Database Configuration](#database-configuration)
    - [Running the Backend](#running-the-backend)
    - [API Endpoints](#api-endpoints)
  - [Overall Project Setup](#overall-project-setup)
  - [Contributing](#contributing)
  - [License](#license)

## Project Overview

This application provides a user interface to list connected YubiKeys, view their detailed information (firmware version, form factor, device type, FIPS/SKY status), and persist this data into a PostgreSQL database. The backend communicates with YubiKeys using the `ykman` command-line tool.

## Features

-   **YubiKey Detection**: Automatically detects connected YubiKeys.
-   **Detailed Information Retrieval**: Fetches comprehensive details for each YubiKey.
-   **Database Integration**: Stores YubiKey information and detection history in a PostgreSQL database.
-   **API Endpoints**: Provides RESTful APIs for YubiKey management and data retrieval.
-   **User Interface**: A modern web interface built with Next.js and React.

## Screenshots

Here are a couple of screenshots showing the application in action.

### Dashboard View

This view shows the main dashboard with statistics about the YubiKeys.

![Dashboard View](frontend/public/dashboard.png)

### Device Details View

This view shows the detailed information for a specific YubiKey.

![Device Details View](frontend/public/details.png)

## Frontend (Next.js)

The frontend is a Next.js application that provides the user interface for interacting with the backend API.

### Technologies Used

-   [Next.js](https://nextjs.org/) (v15.3.5) - React framework for building web applications.
-   [React](https://react.dev/) (v19.0.0) - JavaScript library for building user interfaces.
-   [TypeScript](https://www.typescriptlang.org/) (v5) - Superset of JavaScript that adds static typing.
-   [Tailwind CSS](https://tailwindcss.com/) (v4) - Utility-first CSS framework.
-   [ESLint](https://eslint.org/) (v9) - Pluggable JavaScript linter.
-   [Shadcn UI](https://ui.shadcn.com/) - A collection of re-usable components built using Radix UI and Tailwind CSS. The following components are used:
    -   Alert
    -   Badge
    -   Button
    -   Card

### Setup and Installation

1.  Navigate to the `frontend` directory:
    ```bash
    cd frontend
    ```
2.  Install the dependencies using npm, yarn, pnpm, or bun:
    ```bash
    npm install
    # or
    yarn install
    # or
    pnpm install
    # or
    bun install
    ```

### Running the Frontend

To run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result. The page auto-updates as you edit the files.

## Backend (Flask)

The backend is a Flask application that exposes RESTful APIs to interact with YubiKeys and manage the database. It uses the `ykman` command-line tool to communicate with YubiKeys.

### Technologies Used

-   [Flask](https://flask.palletsprojects.com/) (v3.1.0) - Python web framework.
-   [Flask-SQLAlchemy](https://flask-sqlalchemy.palletsprojects.com/) (v3.1.1) - SQLAlchemy integration for Flask.
-   [Flask-Migrate](https://flask-migrate.readthedocs.io/) (v4.1.0) - Alembic database migrations for Flask applications.
-   [Flask-CORS](https://flask-cors.readthedocs.io/) (v5.0.1) - A Flask extension for handling Cross Origin Resource Sharing (CORS).
-   [Flask-Session](https://flask-session.readthedocs.io/) (v0.8.0) - Server-side session extension for Flask.
-   [Psycopg2](https://www.psycopg.org/) (v2.9.9) - PostgreSQL adapter for Python.
-   [YubiKey Manager (ykman)](https://developers.yubico.com/yubikey-manager/) (v5.6.1) - Command-line tool for configuring YubiKeys.

### Setup and Installation

1.  Navigate to the `backend` directory:
    ```bash
    cd backend
    ```
2.  It is recommended to create a virtual environment:
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows: `venv\Scripts\activate`
    ```
3.  Install the Python dependencies:
    ```bash
    pip install -r requirements.txt
    ```
4.  Ensure `ykman` is installed and accessible in your system's PATH. You can verify by running `ykman --version` in your terminal. If not installed, follow the instructions on the [Yubico website](https://developers.yubico.com/yubikey-manager/):
    ```bash
    ykman --version
    ```

### Database Configuration

The application uses PostgreSQL. Ensure you have a PostgreSQL server running.
The database connection string is configured in `backend/app.py`:
`app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://postgres:postgres@localhost/yubikey_manager'`

You might need to change `postgres:postgres` to your PostgreSQL username and password, and `localhost/yubikey_manager` to your database host and name.

To initialize the database tables, you can run the `/api/database/init` endpoint or ensure `db.create_all()` is called when the app starts (which is already configured in `app.py`).

### Running the Backend

To run the Flask development server:

```bash
python app.py
```

The backend will run on `http://127.0.0.1:5000`.

### API Endpoints

The backend exposes the following API endpoints:

-   `GET /api/yubikeys`: Lists all connected YubiKeys.
    -   Query parameter: `auto_save` (boolean, default `false`) - if `true`, detected YubiKeys will be saved to the database.
-   `GET /api/yubikey/<int:serial>/info`: Gets detailed information for a specific YubiKey by serial number.
    -   Query parameter: `auto_save` (boolean, default `false`) - if `true`, the YubiKey information will be saved to the database.
-   `POST /api/yubikey/<int:serial>/save`: Manually saves a specific YubiKey's information to the database.
-   `GET /api/database/yubikeys`: Retrieves all YubiKeys stored in the database.
-   `GET /api/database/detections`: Retrieves the recent detection history from the database (last 100 detections).
-   `GET /api/database/stats`: Provides statistics about the database (total YubiKeys, total detections, recent detections in the last 24 hours).
-   `GET /api/yubikey/test`: Tests if the `ykman` command-line tool is working correctly.
-   `GET /api/database/test`: Tests the database connection.
-   `POST /api/database/init`: Initializes (creates) the database tables.

## Overall Project Setup

To run the entire application:

1.  **Start the Backend**:
    ```bash
    cd backend
    python app.py
    ```
2.  **Start the Frontend**:
    ```bash
    cd frontend
    npm run dev # or yarn dev, pnpm dev, bun dev
    ```
3.  Access the application in your browser at `http://localhost:3000`.

## Contributing

Feel free to contribute to this project by submitting issues or pull requests.

## License

This project is open-source and available under the MIT License.