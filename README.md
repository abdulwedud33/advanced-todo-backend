# Node Authentication Project

This project implements a simple authentication system using Node.js, Express, and PostgreSQL. It provides functionality for user sign up, sign in, and sign out.

## Project Structure

node-auth-project
├── src
│   ├── controllers
│   │   ├── authController.js
│   └── routes
│       ├── authRoutes.js
├── config
│   └── db.js
├── middleware
│   └── authMiddleware.js
├── models
│   └── userModel.js
├── .env
├── package.json
├── server.js
└── README.md

## Installation

1. Clone the repository:

   git clone <repository-url>

2. Navigate to the project directory:
   cd node-auth-project

3. Install the dependencies:
   npm install

4. Create a `.env` file in the root directory and add your environment variables:
   DB_USER=your_db_user
   DB_HOST=your_db_host
   DB_NAME=your_db_name
   DB_PASSWORD=your_db_password
   DB_PORT=your_db_port
   JWT_SECRET=your_jwt_secret

## Usage

1. Start the server:
   npm start

2. The server will run on `http://localhost:3000`.

## API Endpoints

- **Sign Up**
  - `POST /api/signup`
  - Request body: `{ "username": "your_username", "password": "your_password" }`

- **Sign In**
  - `POST /api/signin`
  - Request body: `{ "username": "your_username", "password": "your_password" }`

- **Sign Out**
  - `POST /api/signout`
  - No request body required.

## License

This project is licensed under the MIT License.