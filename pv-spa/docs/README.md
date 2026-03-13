# HBVU PHOTOS Frontend

A Vue 3 frontend application for HBVU PHOTOS - a minimalist photo gallery interface with user authentication and role-based access control.

## 🚀 Quick Start

1. **Clone and Install**
   ```bash
   git clone <repository-url>
   cd photovault-fe
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```

## 🔐 Security & Authentication

This application includes comprehensive user authentication with role-based access control:

- **Demo Mode**: Safe development environment with test credentials
- **Production Ready**: Backend authentication integration prepared  
- **Secure Configuration**: Environment variables for all sensitive data
- **Permission System**: Granular access control for admin/user roles

### Authentication Setup

This application supports both demo and production authentication modes:

- **Demo Mode**: Safe development environment with pre-configured test accounts
- **Production Mode**: Backend authentication integration with secure credential management
- **Role-Based Access**: Granular permissions for admin and user roles

For demo mode setup and credential configuration, please refer to the deployment documentation or contact your system administrator.

⚠️ **Security Note**: Never use demo mode in production environments. See deployment documentation for secure configuration guidelines.

## Backend API

This frontend connects to the [HBVU PHOTOS API](https://github.com/ekskog/photovault-api) which provides:

- `GET /buckets` - List buckets
- `POST /buckets` - Create bucket
- `GET /buckets/:bucketName/objects` - List objects/folders
- `POST /buckets/:bucketName/upload` - Upload files
- `POST /buckets/:bucketName/folders` - Create folder
- `DELETE /buckets/:bucketName/folders` - Delete folder

API uses MinIO storage backend and returns JSON responses.
