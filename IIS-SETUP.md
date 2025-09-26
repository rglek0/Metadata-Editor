# IIS Setup Guide for Metadata Editor

## Quick Setup Checklist

### 1. Install Required IIS Modules
Run PowerShell as Administrator and execute:
```powershell
# Enable IIS if not already enabled
Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServerRole, IIS-WebServer, IIS-CommonHttpFeatures, IIS-HttpErrors, IIS-HttpLogging, IIS-RequestFiltering, IIS-StaticContent, IIS-DefaultDocument

# Download and install URL Rewrite Module
# Go to: https://www.iis.net/downloads/microsoft/url-rewrite

# Download and install Application Request Routing
# Go to: https://www.iis.net/downloads/microsoft/application-request-routing
```

### 2. Start Node.js Application
```bash
cd "C:\Users\rostg\source\repos\metadata-editor"
node server.js
```
✅ Verify it's running at http://localhost:3000

### 3. Configure IIS Website
1. **Open IIS Manager** (`inetmgr`)
2. **Create New Site**:
   - Right-click "Sites" → "Add Website"
   - **Site name**: `Metadata Editor`
   - **Physical path**: `C:\Users\rostg\source\repos\metadata-editor`
   - **Port**: `80` (or `8080` if port 80 is occupied)
   - Click **OK**

3. **Enable Proxy (One-time setup)**:
   - Click on **server name** (top level in IIS Manager)
   - Double-click **"Application Request Routing Cache"**
   - Click **"Server Proxy Settings"** in the Actions panel
   - Check ✅ **"Enable proxy"**
   - Click **Apply**

### 4. Test the Setup
- **IIS URL**: http://localhost (or your configured port)
- **Direct Node.js**: http://localhost:3000
- Both should show the same metadata editor interface

## Troubleshooting

### Common Issues:

1. **"URL Rewrite Module not found"**
   - Download and install from: https://www.iis.net/downloads/microsoft/url-rewrite

2. **"ARR is not enabled"**
   - Download ARR from: https://www.iis.net/downloads/microsoft/application-request-routing
   - Enable proxy in Server Proxy Settings

3. **"Node.js not responding"**
   - Ensure `node server.js` is running
   - Check http://localhost:3000 works directly

4. **Port 80 already in use**
   - Use a different port (e.g., 8080) when creating the IIS site
   - Access via http://localhost:8080

5. **Static files not loading**
   - Check that Physical Path points to the correct folder
   - Verify web.config is in the root directory

### File Structure Should Look Like:
```
C:\Users\rostg\source\repos\metadata-editor\
├── web.config          ← IIS configuration
├── server.js           ← Node.js server
├── package.json
└── public\
    ├── index.html
    └── readme.md
```

## Benefits of This Setup
- ✅ Professional URLs (no :3000 port)
- ✅ Can use port 80/443 (standard web ports)
- ✅ Easy SSL certificate installation
- ✅ Windows Authentication integration
- ✅ Better performance for static files
- ✅ Production-ready deployment