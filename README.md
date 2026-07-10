# Baba Mohalla Committee App

A web app for managing monthly committee collections, with live cloud sync so every device shows the exact same data.

Live app: https://shoawfkiat29.github.io/baba-mohalla-committee/

## Roles

- **Admin** — logs in with email + password (Firebase Authentication). Can add/edit/delete families, record payments, send WhatsApp receipts, and manage settings. Only emails allowed in the Firestore security rules can write data.
- **Viewer** — no login needed. Read-only access to the dashboard, families, and payment history.

## How it works

- Data (families, payments, settings) lives in **Firebase Firestore** and syncs live to all devices. Works offline too — changes catch up when internet returns.
- The app itself is static HTML/CSS/JS hosted on GitHub Pages. `js/firebase-config.js` holds the Firebase web config.
- After recording a payment, the receipt can be sent via WhatsApp (opens the chat with the message pre-filled), copied, or printed.

## Backup

Settings → Export Backup downloads all data as JSON. Import Backup replaces the cloud data with a backup file's contents (admin only).
