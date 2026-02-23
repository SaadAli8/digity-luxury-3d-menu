# Deploy DIGITY 3D Menu on Ubuntu Server

Follow these steps on your Ubuntu instance (e.g. EC2).

## 1. Install Node.js (LTS)

```bash
# Update package list
sudo apt update

# Install Node.js 20.x (LTS) via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node -v   # v20.x.x
npm -v
```

## 2. Get your project on the server

**Option A – Clone from Git (recommended)**

```bash
# Install git if needed
sudo apt install -y git

# Clone (replace with your repo URL)
cd ~
git clone https://github.com/YOUR_USERNAME/digity-luxury-3d-menu.git
cd digity-luxury-3d-menu
```

**Option B – Upload with SCP from your PC**

From your **local machine** (PowerShell):

```powershell
scp -r -i "your-key.pem" d:\Three.js\digity-luxury-3d-menu ubuntu@YOUR_SERVER_IP:~/
```

Then on the server:

```bash
cd ~/digity-luxury-3d-menu
```

## 3. Build the app

```bash
cd ~/digity-luxury-3d-menu   # or your project path

npm ci
npm run build
```

The built site is in the `dist/` folder.

## 4. Serve the site

**Option A – Nginx (good for production)**

```bash
sudo apt install -y nginx

# Copy built files to nginx default root
sudo cp -r dist/* /var/www/html/

# Or use a dedicated folder and config
sudo mkdir -p /var/www/digity
sudo cp -r dist/* /var/www/digity/
sudo chown -R www-data:www-data /var/www/digity
```

Create a site config (optional, for a domain):

```bash
sudo nano /etc/nginx/sites-available/digity
```

Paste (replace `YOUR_DOMAIN_OR_IP` with your domain or server IP):

```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_IP;
    root /var/www/digity;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/digity /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

**Option B – Quick test with `serve` (no nginx)**

```bash
npx serve dist -l 3000
```

Open `http://YOUR_SERVER_IP:3000`. To allow port 3000 through a firewall:

```bash
# If using UFW
sudo ufw allow 3000
sudo ufw reload
```

## 5. Security and firewall

- Open only what you need (e.g. 80, 443, 22 for SSH).
- Prefer SSH key login and disable password auth if possible.

```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

## 6. Updating after changes

```bash
cd ~/digity-luxury-3d-menu
git pull
npm ci
npm run build
sudo cp -r dist/* /var/www/digity/
# or: sudo cp -r dist/* /var/www/html/
```

---

**Quick recap**

| Step        | Command / action                          |
|------------|--------------------------------------------|
| Install Node | `curl -fsSL https://deb.nodesource.com/setup_20.x \| sudo -E bash -` then `sudo apt install -y nodejs` |
| Clone       | `git clone <repo> && cd digity-luxury-3d-menu` |
| Build       | `npm ci && npm run build`                  |
| Serve       | Copy `dist/*` to `/var/www/html/` or use nginx + `try_files` for SPA |

If the instance has a public IP, open **http://YOUR_SERVER_IP** in a browser (and ensure port 80 is allowed in the cloud security group / firewall).
