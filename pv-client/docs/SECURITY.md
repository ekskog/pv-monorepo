# HBVU PHOTOS - Security Configuration

## Overview
This document outlines the security improvements made to the HBVU PHOTOS frontend application.

## Environment Variable Configuration

### Setup
1. Copy `.env.example` to `.env`
2. Configure your environment variables
3. **IMPORTANT**: Never commit `.env` files to version control

### Environment Variables

#### Required
- `VITE_API_URL`: Your backend API URL

#### Demo Mode (Development Only)
- `VITE_DEMO_MODE=true`: Enables demo authentication
- `VITE_DEMO_ADMIN_USERNAME`: Demo admin username
- `VITE_DEMO_ADMIN_PASSWORD`: Demo admin password
- `VITE_DEMO_USER_USERNAME`: Demo user username
- `VITE_DEMO_USER_PASSWORD`: Demo user password

#### Production Mode
- `VITE_DEMO_MODE=false`: Disables demo mode
- `VITE_AUTH_ENDPOINT`: Backend authentication endpoint
- `VITE_USER_ENDPOINT`: Backend user management endpoint

## Security Improvements

### 1. Credential Management
- ✅ **Removed hardcoded credentials** from source code
- ✅ **Environment variable configuration** for all sensitive data
- ✅ **`.gitignore` protection** for environment files
- ✅ **Demo mode toggle** for development vs production

### 2. Authentication Service
- ✅ **Secure token storage** with localStorage
- ✅ **Token validation** on app initialization
- ✅ **Automatic session cleanup** on invalid tokens
- ✅ **Production-ready backend integration** prepared

### 3. Permission System
- ✅ **Role-based access control** (admin/user)
- ✅ **Action-based permissions** for granular control
- ✅ **UI-level guards** preventing unauthorized actions
- ✅ **API-level authorization** headers

## Production Deployment

### Backend Integration
To use with a real backend, set these environment variables:

```env
VITE_DEMO_MODE=false
VITE_AUTH_ENDPOINT=/api/auth/login
VITE_USER_ENDPOINT=/api/users
```

### Expected Backend API
Your backend should implement these endpoints:

#### Authentication
- `POST /api/auth/login` - User login
  - Body: `{ username, password }`
  - Response: `{ token, user: { id, username, name, email, role, permissions } }`

- `GET /api/auth/validate` - Token validation
  - Headers: `Authorization: Bearer <token>`
  - Response: `200 OK` or `401 Unauthorized`

#### User Management (Admin Only)
- `GET /api/users` - List all users
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

## Security Best Practices

### Development
- Always use `.env` files for sensitive configuration
- Never commit credentials to version control
- Use demo mode only for development/testing
- Regularly rotate demo credentials

### Production
- Use secure HTTPS endpoints
- Implement proper token refresh mechanisms
- Use secure session storage
- Implement rate limiting
- Use strong password policies
- Enable audit logging

## Migration Guide

### From Hardcoded to Environment Variables
1. Update your `.env` file with current credentials
2. Deploy the new authentication service
3. Test login functionality
4. Gradually migrate to backend authentication
5. Set `VITE_DEMO_MODE=false` in production

### Security Checklist
- [ ] Environment variables configured
- [ ] `.env` file in `.gitignore`
- [ ] Demo mode disabled in production
- [ ] Backend authentication endpoints ready
- [ ] Token refresh mechanism implemented
- [ ] HTTPS enabled for all API calls
- [ ] Session timeout configured
- [ ] Audit logging enabled

## Warning Signs
🚨 **Never do these:**
- Commit `.env` files to git
- Use demo mode in production
- Store passwords in plain text
- Skip token validation
- Allow unlimited login attempts
- Use HTTP for authentication endpoints

## Support
For security questions or issues, please:
1. Check this documentation first
2. Review the authentication service code
3. Test in demo mode before production
4. Contact the development team for assistance
