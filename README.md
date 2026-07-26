# Akirapa Messaging App (Standalone Project)

A dedicated, mobile-first, WhatsApp-inspired standalone care pod messaging web application built for **Caregivers**, **Clients / Family Members**, and **Admins**.

---

## Folder Structure

```
Messaging App/
├── index.html        # Main Single-Page Application (Auth + Chat UI)
├── styles.css        # Vanilla CSS WhatsApp-style design system
├── package.json      # Independent package config & npm start script
├── js/
│   ├── auth.js          # Authentication, session check, & role badges
│   ├── audioRecorder.js # Voice memo recorder (MediaRecorder API)
│   ├── mediaViewer.js   # Image Lightbox & video player modal
│   └── chatApp.js       # Core real-time thread & message controller
└── README.md
```

---

## Features

- **Account Onboarding**: Sign in or Register as a Caregiver, Client / Family Member, or Admin.
- **Role Differentiation Badges**: Visually separates `[Caregiver]`, `[Client]`, `[Family]`, and `[Admin]` messages.
- **Voice Memos (Audio)**: In-browser voice recorder with timer and playable waveform controls.
- **Photos & Videos**: Full media attachment support with lightbox zoom and modal player.

---

## How to Run Independently

1. Open a terminal inside `Messaging App`:
   ```bash
   cd "d:\Akirapa System\Messaging App"
   ```
2. Start the local server:
   ```bash
   npm start
   ```
3. Open `http://localhost:3001` in your browser.
