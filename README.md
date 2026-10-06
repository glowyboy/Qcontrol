# 📱 Q-Control Mobile App

A security management mobile application with real-time SOS alerts, GPS checkpoint tracking, QR code scanning, and incident reporting.

## ✨ Features

### 🚨 **Real-Time SOS Alerts**
- Emergency button with GPS location
- Instant alerts to control center
- No refresh needed - pure WebSocket

### 📍 **GPS Checkpoint Tracking**
- Record location during patrols
- Timestamp verification
- Real-time location updates

### 📷 **QR Code Scanner**
- Scan patrol points
- Scan employees/visitors/vehicles
- Automatic logging

### 📝 **Incident Reporting**
- Submit detailed reports
- Real-time submission
- Track incident status

### 📖 **User Guide**
- Complete instructions
- Safety guidelines
- Feature documentation

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or pnpm
- Supabase account

### Installation

```bash
# Clone repository
git clone https://github.com/glowyboy05-gif/wafwafwafwaf.git
cd wafwafwafwaf

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your Supabase credentials
# NEXT_PUBLIC_SUPABASE_URL=your-url
# NEXT_PUBLIC_SUPABASE_ANON_KEY=your-key

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 🔑 Login

Use your Employee ID and PIN code:
- Employee ID: `EMP210664` (example)
- PIN: Your 4-digit PIN

---

## 🏗️ Tech Stack

- **Framework**: Next.js 14
- **Language**: TypeScript
- **Styling**: Custom CSS (Dashboard design)
- **Database**: Supabase (PostgreSQL)
- **Real-Time**: Supabase Realtime (WebSockets)
- **Maps**: Google Maps API
- **Icons**: Lucide React

---

## 📱 Pages

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/` | Main dashboard with SOS, SCAN, CHECKPOINT |
| Scan | `/scan` | QR code scanner for patrol/employees |
| Rapport | `/rapport` | Incident report form |
| Instructions | `/instructions` | User guide and safety tips |

---

## 🌐 Deployment

### Deploy to Vercel

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy!

### Build for Production

```bash
npm run build
npm start
```

---

## 📊 Database Setup

Run these SQL scripts in Supabase:

1. `FIX-ALL-TABLES-NOW.sql` - Creates all tables
2. `FIX-SOS-COLUMNS-NOW.sql` - Adds SOS columns
3. `CRITICAL-ENABLE-REALTIME.sql` - Enables real-time

Enable realtime publication:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE sos_alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE employee_location_tracking;
ALTER PUBLICATION supabase_realtime ADD TABLE incident_reports;
```

---

## 🔒 Security

- Row Level Security (RLS) enabled
- Account-based data filtering
- PIN-based authentication
- GPS location encryption

---

## 📱 Convert to Native App

### Using Capacitor (Recommended)

```bash
npm install @capacitor/core @capacitor/cli
npx cap init
npx cap add android
npx cap add ios
npm run build
npx cap sync
npx cap open android
```

### Or Use PWA (Progressive Web App)

The app is already PWA-ready with `manifest.json`!

---

## 🎨 Branding

- **Primary Color**: `#062c4d` (Navy)
- **Accent Color**: `#109b67` (Green)
- **Alert Color**: `#d71920` (Red)
- **Logo**: `/public/q-controle-logo.jpg`

---

## 📝 Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

---

## 🐛 Troubleshooting

### Real-time not working?
1. Enable realtime in Supabase Dashboard
2. Run `CRITICAL-ENABLE-REALTIME.sql`
3. Hard refresh browser

### Login not working?
1. Check Supabase credentials in `.env`
2. Verify employee exists in database
3. Check PIN is correct

---

## 📄 License

Proprietary - Q-Control System

---

## 👨‍💻 Support

For support, contact: qcontrol@support.com

---

**Built with ❤️ for Q-Control Security**

🔗 [Live Demo](#) | 📖 [Documentation](#) | 🐛 [Report Bug](#)
