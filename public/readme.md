# Metadata Editor

A web-based image metadata editor that allows you to view and modify EXIF data, GPS coordinates, and other metadata in image files.

## 🚀 Quick Start

### Development Mode (Node.js only)
```bash
node server.js
```
The server will run at `http://localhost:3000`

### Production Mode (IIS + Node.js) - CURRENT SETUP
**✅ Currently running at: `http://localhost/meta/`**

## 📁 Project Structure
```
C:\Users\rostg\source\repos\metadata-editor\     # Development workspace (edit here)
└── public/
    └── index.html                               # UI files
└── server.js                                    # Node.js backend
└── web.config                                   # IIS configuration
└── uploads/                                     # Image upload directory
└── temp/                                        # Temporary processing files

C:\inetpub\wwwroot\metadata-editor\              # Production deployment (IIS serves from here)
```

## 🔄 Development Workflow

### 1. Making Changes
- **Edit files in**: `C:\Users\rostg\source\repos\metadata-editor\`
- **Test locally**: Run `node server.js` and visit `http://localhost:3000`

### 2. Deploying Changes
```powershell
# Sync changes to production
robocopy "C:\Users\rostg\source\repos\metadata-editor" "C:\inetpub\wwwroot\metadata-editor" /MIR /XD ".git" "node_modules"

# Restart Node.js server if needed
# (The server runs from the IIS location)
```

### 3. Version Control
```bash
git add .
git commit -m "Your changes"
git push origin main
```

## 🌐 Access URLs
- **Production (IIS)**: `http://localhost/meta/`
- **Development**: `http://localhost:3000`
- **GitHub Repository**: https://github.com/rglek0/Metadata-Editor

## ⚙️ Technical Setup (Already Configured)

### Prerequisites ✅
- [x] IIS with URL Rewrite Module
- [x] Application Request Routing (ARR) 
- [x] Node.js server running on port 3000
- [x] Proper file permissions configured

### IIS Configuration ✅
- **Application**: `/meta` pointing to `C:\inetpub\wwwroot\metadata-editor\`
- **Application Pool**: `.NET Core`
- **Permissions**: IIS_IUSRS, DefaultAppPool, .NET Core pool identities
- **URL Rewrite**: Configured to proxy dynamic requests to Node.js

### How It Works
1. **Static Files**: IIS serves `index.html` and static assets directly
2. **Dynamic Requests**: `/upload`, `/metadata` routes are proxied to Node.js server
3. **File Processing**: ExifTool integration handles metadata operations
4. **Uploads**: Files stored in `uploads/` directory with proper permissions

## 🛠️ Troubleshooting
- **403/404 Errors**: Check file permissions and ensure Node.js server is running
- **Upload Issues**: Verify `uploads/` directory permissions
- **Metadata Processing**: Ensure ExifTool is available in the system PATH