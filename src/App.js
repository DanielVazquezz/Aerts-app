import React from "react";
import { useState, useEffect, useRef, useCallback } from "react";

/* ═══ FIREBASE ═══ */

// Auto-configure viewport for mobile (runs once)
(function setupViewport() {
  if (typeof document === "undefined") return;
  // Set viewport meta
  let vp = document.querySelector('meta[name="viewport"]');
  if (!vp) { vp = document.createElement("meta"); vp.name = "viewport"; document.head.appendChild(vp); }
  vp.content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover";
  // Apple web app meta
  const addMeta = (name, content) => { if (!document.querySelector(`meta[name="${name}"]`)) { const m = document.createElement("meta"); m.name = name; m.content = content; document.head.appendChild(m); } };
  addMeta("apple-mobile-web-app-capable", "yes");
  addMeta("apple-mobile-web-app-status-bar-style", "default");
  addMeta("theme-color", "#faf9f7");
  // Prevent bounce/overscroll
  document.documentElement.style.cssText = "height:100%;width:100%;overflow:hidden;position:fixed;top:0;left:0;right:0;bottom:0";
  document.body.style.cssText = "height:100%;width:100%;overflow:hidden;position:fixed;top:0;left:0;right:0;bottom:0;-webkit-text-size-adjust:100%;-webkit-tap-highlight-color:transparent";
  const root = document.getElementById("root");
  if (root) root.style.cssText = "height:100%;width:100%;overflow:hidden";
  // Set title
  document.title = "Aeris";
})();

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDdlYYn-oNkn-kswsd087gXgBBCobWCtx4",
  authDomain: "notes-app-7bc31.firebaseapp.com",
  projectId: "notes-app-7bc31",
  storageBucket: "notes-app-7bc31.firebasestorage.app",
  messagingSenderId: "778010449575",
  appId: "1:778010449575:web:f3446f32bf398ba52a6d82",
};

const FB_VERSION = "10.14.1";
const FB_BASE = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function initFirebase() {
  try {
    await loadScript(`${FB_BASE}/firebase-app-compat.js`);
    await loadScript(`${FB_BASE}/firebase-auth-compat.js`);
    await loadScript(`${FB_BASE}/firebase-firestore-compat.js`);
    const app = window.firebase.apps.length ? window.firebase.app() : window.firebase.initializeApp(FIREBASE_CONFIG);
    const auth = window.firebase.auth();
    const db = window.firebase.firestore();
    return { app, auth, db };
  } catch (e) { console.warn("Firebase init failed:", e); return null; }
}

async function signInWithGoogle(auth) {
  const provider = new window.firebase.auth.GoogleAuthProvider();
  return auth.signInWithPopup(provider);
}

async function saveToFirestore(db, uid, notes, folders, settings) {
  try {
    const payload = {
      notesJson: JSON.stringify(serializeNotes(notes)),
      foldersJson: JSON.stringify(folders),
      settings,
      v: 2,
      savedAt: new Date().toISOString(),
    };
    // Always save to localStorage first (instant, reliable)
    try { localStorage.setItem("aeris-" + uid, JSON.stringify(payload)); } catch(e) {}
    // Then save to Firestore (cloud sync)
    await db.collection("users").doc(uid).set(payload);
    return { ok: true };
  } catch (e) {
    console.warn("Firestore save failed:", e);
    return { ok: false, error: e.code + ": " + e.message };
  }
}

async function loadFromFirestore(db, uid) {
  let localData = null;
  let cloudData = null;

  function parsePayload(raw) {
    // v2 format: JSON strings
    if (raw.notesJson) {
      return {
        notes: deserializeNotes(JSON.parse(raw.notesJson)),
        folders: JSON.parse(raw.foldersJson),
        settings: raw.settings || { dk: false, themeId: "minimal" },
        savedAt: raw.savedAt || "",
      };
    }
    // v1 format: native objects (backwards compat)
    return {
      notes: deserializeNotes(raw.notes || []),
      folders: raw.folders || DEFAULT_FOLDERS,
      settings: raw.settings || { dk: false, themeId: "minimal" },
      savedAt: raw.savedAt || "",
    };
  }

  // 1) Load from localStorage (instant)
  try {
    const raw = localStorage.getItem("aeris-" + uid);
    if (raw) localData = parsePayload(JSON.parse(raw));
  } catch(e) {}

  // 2) Load from Firestore (may be newer from other device)
  try {
    const doc = await db.collection("users").doc(uid).get();
    if (doc.exists) cloudData = parsePayload(doc.data());
  } catch (e) { console.warn("Firestore load failed:", e); }

  // 3) Return the most recent one
  if (cloudData && localData) {
    return cloudData.savedAt >= localData.savedAt ? cloudData : localData;
  }
  return cloudData || localData || null;
}

/* ═══ DATA ═══ */
const DEFAULT_FOLDERS = [
  { id: "personal", name: "Personal", icon: "◐", color: "#e8a449" },
  { id: "work", name: "Work", icon: "◆", color: "#4a7dbd" },
  { id: "ideas", name: "Ideas", icon: "✦", color: "#9b59b6" },
  { id: "journal", name: "Journal", icon: "◑", color: "#3a7d44" },
];

function mkTxt(s) { return { id: "b" + Math.random().toString(36).slice(2, 8), type: "text", html: s }; }
function mkTodo(items) { return { id: "b" + Math.random().toString(36).slice(2, 8), type: "todo", items: items.map(([t, d]) => ({ id: "t" + Math.random().toString(36).slice(2, 8), text: t, done: d })) }; }
function mkTable(rows) { return { id: "b" + Math.random().toString(36).slice(2, 8), type: "table", rows }; }
function mkFile(name, size, ext, dataUrl) { return { id: "b" + Math.random().toString(36).slice(2, 8), type: "file", name, size, ext, dataUrl: dataUrl || null }; }

const SAMPLE_NOTES = [
  { id: 1, title: "Welcome to Notes", blocks: [mkTxt("This is your personal space for thoughts, ideas, and everything in between. Start writing — your mind will thank you."), mkTxt("Try the <u>underline</u> and <mark>highlight</mark> features, add to-do lists, tables, or attach files.")], date: new Date(2026, 1, 15, 9, 30), color: 0, pinned: true, folderId: null },
  { id: 2, title: "Design Philosophy", blocks: [mkTxt("Good design is as little design as possible. <mark>Less, but better</mark> — because it concentrates on the essential aspects.")], date: new Date(2026, 1, 14, 16, 45), color: 1, pinned: false, folderId: "ideas" },
  { id: 3, title: "Weekly Goals", blocks: [mkTodo([["Deep work sessions in the morning", true], ["Collaborate in the afternoon", false], ["Creative exploration time", false], ["Review weekly progress", false]])], date: new Date(2026, 1, 14, 8, 0), color: 2, pinned: false, folderId: "work" },
  { id: 4, title: "Book Recommendations", blocks: [mkTable([["Title", "Author", "Status"], ["Thinking, Fast and Slow", "Kahneman", "✓ Read"], ["Creative Selection", "Kocienda", "Reading"], ["Design of Everyday Things", "Norman", "Up next"]])], date: new Date(2026, 1, 13, 20, 15), color: 3, pinned: false, folderId: "personal" },
  { id: 5, title: "Recipe: Lemon Risotto", blocks: [mkTxt("Arborio rice, vegetable broth, one large lemon (zest and juice), parmesan, butter, shallots, white wine."), mkFile("risotto-recipe.pdf", "1.2 MB", "pdf")], date: new Date(2026, 1, 12, 19, 0), color: 0, pinned: false, folderId: "personal" },
  { id: 6, title: "Morning Thoughts", blocks: [mkTxt("There is a certain clarity that comes with the first light. Before the noise, before the notifications — just you and the quiet architecture of a new day.")], date: new Date(2026, 1, 11, 6, 45), color: 4, pinned: false, folderId: "journal" },
  { id: 7, title: "App Launch Checklist", blocks: [mkTodo([["Final QA pass", true], ["Performance audit", true], ["Write App Store copy", false], ["Prepare press kit", false], ["Schedule launch tweets", false]]), mkFile("press-kit-v2.zip", "8.4 MB", "zip")], date: new Date(2026, 1, 10, 11, 20), color: 2, pinned: false, folderId: "work" },
  { id: 8, title: "A dream about the sea", blocks: [mkTxt("I was standing on a shore made entirely of <mark>white piano keys</mark>. The waves played themselves.")], date: new Date(2026, 1, 9, 7, 10), color: 4, pinned: false, folderId: "journal" },
];

const PALETTES = [
  { bg: "rgba(255,255,255,0.55)", accent: "#1d1d1f" },
  { bg: "rgba(255,241,224,0.6)", accent: "#9a6832" },
  { bg: "rgba(224,240,255,0.6)", accent: "#2a6496" },
  { bg: "rgba(232,245,233,0.6)", accent: "#3a7d44" },
  { bg: "rgba(243,229,245,0.6)", accent: "#7b4b94" },
];
const THEMES = [
  {
    id: "minimal", name: "Minimal",
    phoneBg: "#faf9f7", rootBg: "#f2f0ed",
    headFont: "'Source Serif 4',Georgia,serif", bodyFont: "'Source Serif 4',Georgia,serif",
    uiFont: "'SF Pro Display',-apple-system,BlinkMacSystemFont,sans-serif",
    cardRadius: 18, searchRadius: 14, fabRadius: 28,
    cardStyle: "glass", // glass | solid | shadow
    headWeight: 700, headSpacing: -.8,
    accentColor: "#1d1d1f", accentSoft: "#6e6e73",
    checkColor: "#34c759",
    preview: { bg1: "#faf9f7", bg2: "#eee8df", fg: "#1d1d1f" },
  },
  {
    id: "editorial", name: "Editorial",
    phoneBg: "#f5f0e6", rootBg: "#e8e0d0",
    headFont: "'Playfair Display',Georgia,serif", bodyFont: "'Lora',Georgia,serif",
    uiFont: "'Lora',Georgia,serif",
    cardRadius: 4, searchRadius: 4, fabRadius: 4,
    cardStyle: "solid",
    headWeight: 900, headSpacing: -.5,
    accentColor: "#2c2c2c", accentSoft: "#8c7e6d",
    checkColor: "#b8860b",
    preview: { bg1: "#f5f0e6", bg2: "#ddd4c0", fg: "#2c2c2c" },
  },
  {
    id: "diary", name: "Diary",
    phoneBg: "#fef9f0", rootBg: "#f0e6d3",
    headFont: "'Caveat',cursive", bodyFont: "'Caveat',cursive",
    uiFont: "'Caveat',cursive",
    cardRadius: 6, searchRadius: 8, fabRadius: 50,
    cardStyle: "paper",
    headWeight: 700, headSpacing: .3,
    accentColor: "#5a4a3a", accentSoft: "#9c8b78",
    checkColor: "#7a6a5a",
    preview: { bg1: "#fef9f0", bg2: "#f0e4ce", fg: "#5a4a3a" },
  },
];
const FC = ["#e8a449","#4a7dbd","#9b59b6","#3a7d44","#e05555","#2bbcb3","#e07830","#8b6cc1"];
const FIcon = ["◐","◆","✦","◑","▲","●","■","◈"];

function fmtDate(d) { const now = new Date(2026,1,15,12,0), diff = now - d, days = Math.floor(diff / 864e5); if (days === 0) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }); if (days === 1) return "Yesterday"; if (days < 7) return d.toLocaleDateString("en-US", { weekday: "long" }); return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
function fmtFull(d) { return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }); }
function blocksToText(blocks) { if (!blocks) return ""; return blocks.map(b => { if (b.type === "text") return b.html.replace(/<[^>]+>/g, ""); if (b.type === "todo") return b.items.map(i => (i.done ? "✓ " : "○ ") + i.text).join(" "); if (b.type === "table") return b.rows.map(r => r.join(" ")).join(" "); if (b.type === "file") return "📎 " + b.name; return ""; }).join(" "); }
function excerpt(blocks, m = 68) { const t = blocksToText(blocks).replace(/\n/g, " ").trim(); if (!t) return "No additional text"; return t.length > m ? t.slice(0, m).trim() + "…" : t; }
const uid = () => "b" + Math.random().toString(36).slice(2, 8);

const FILE_ICONS = { pdf: "📄", zip: "🗜️", png: "🖼️", jpg: "🖼️", jpeg: "🖼️", doc: "📝", docx: "📝", xls: "📊", xlsx: "📊", mp3: "🎵", mp4: "🎬", txt: "📃", default: "📎" };
function fileIcon(ext) { return FILE_ICONS[ext?.toLowerCase()] || FILE_ICONS.default; }

/* ── SVG Icons ── */
const Hamburger = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>;
const Gear = () => <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
const PinI = ({ filled }) => <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5M9 2h6l-1 7h4l-2 5H8L6 9h4z" /></svg>;
const PlusI = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
const SmPlus = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
const SearchI = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
const BackI = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>;
const TrashI = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>;
const ColorI = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" fill="currentColor" /></svg>;
const TagI = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>;
const XI = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
const Moon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>;
const SunI = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>;
const UserI = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
const PaletteI = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="10.5" r="2.5" opacity=".5" /><circle cx="8.5" cy="5.5" r="2.5" opacity=".7" /><circle cx="6.5" cy="11.5" r="2.5" opacity=".4" /><path d="M12 22C6.5 22 2 17.5 2 12S6.5 2 12 2s10 4.5 10 10c0 2-1 3-3 3h-2a2 2 0 0 0-1 3.75A1.5 1.5 0 0 1 15 20.5 1.5 1.5 0 0 1 13.5 22H12z" /></svg>;
const CheckI = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>;
const FolderSvg = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>;
const TrashSvg = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /></svg>;
/* Toolbar icons */
const UnderlineI = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 3v7a6 6 0 0 0 12 0V3" /><line x1="4" y1="21" x2="20" y2="21" /></svg>;
const HighlightI = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>;
const TodoI = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="6" height="6" rx="1" /><path d="m5 8 1.5 1.5L9 7" /><line x1="13" y1="8" x2="21" y2="8" /><rect x="3" y="14" width="6" height="6" rx="1" /><line x1="13" y1="17" x2="21" y2="17" /></svg>;
const TableI = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /></svg>;
const FileI = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>;
const XSmall = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
const PlusRow = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;

/* ═══ BLOCK EDITORS ═══ */

function TextBlock({ block, onChange, dk, autoFocus, blockRef, themeId }) {
  const ref = useRef(null);
  const htmlRef = useRef(block.html);
  useEffect(() => { if (ref.current && ref.current.innerHTML !== block.html) ref.current.innerHTML = block.html; }, []);
  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus();
      const sel = window.getSelection();
      sel.selectAllChildren(ref.current);
      sel.collapseToEnd();
    }
  }, [autoFocus]);
  useEffect(() => { if (blockRef) blockRef.current = ref.current; });
  const handleInput = () => { if (ref.current) { htmlRef.current = ref.current.innerHTML; onChange(block.id, { ...block, html: ref.current.innerHTML }); } };
  const isDiary = themeId === "diary";
  return <div ref={ref} contentEditable suppressContentEditableWarning onInput={handleInput} data-placeholder={isDiary ? "Write here…" : "Start writing…"} style={{ ...bst.textBlock, color: dk ? "#f5f5f7" : (isDiary ? "#5a4a3a" : "#1d1d1f"), fontSize: isDiary ? 20 : 16, lineHeight: isDiary ? "32px" : 1.7 }} />;
}

function TodoBlock({ block, onChange, dk, focusItemId }) {
  const inputRefs = useRef({});
  const pendingFocus = useRef(focusItemId || null);

  useEffect(() => {
    if (pendingFocus.current && inputRefs.current[pendingFocus.current]) {
      inputRefs.current[pendingFocus.current].focus();
      pendingFocus.current = null;
    }
  });

  const toggle = (itemId) => onChange(block.id, { ...block, items: block.items.map(i => i.id === itemId ? { ...i, done: !i.done } : i) });
  const updateText = (itemId, text) => onChange(block.id, { ...block, items: block.items.map(i => i.id === itemId ? { ...i, text } : i) });
  const addItemAfter = (afterId) => {
    const newId = "t" + uid();
    const idx = block.items.findIndex(i => i.id === afterId);
    const newItems = [...block.items];
    newItems.splice(idx + 1, 0, { id: newId, text: "", done: false });
    pendingFocus.current = newId;
    onChange(block.id, { ...block, items: newItems });
  };
  const removeItem = (itemId) => {
    const idx = block.items.findIndex(i => i.id === itemId);
    const newItems = block.items.filter(i => i.id !== itemId);
    if (newItems.length > 0) {
      const focusIdx = Math.max(0, idx - 1);
      pendingFocus.current = newItems[focusIdx].id;
    }
    onChange(block.id, { ...block, items: newItems });
  };
  const handleKey = (e, itemId) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addItemAfter(itemId);
    } else if (e.key === "Backspace" && block.items.find(i => i.id === itemId)?.text === "") {
      e.preventDefault();
      if (block.items.length > 1) removeItem(itemId);
    }
  };

  return (
    <div style={bst.todoBlock}>
      {block.items.map(item => (
        <div key={item.id} style={bst.todoRow}>
          <div onClick={() => toggle(item.id)} style={{ ...bst.todoCheck, background: item.done ? (dk ? "#4cd964" : "#34c759") : "transparent", borderColor: item.done ? (dk ? "#4cd964" : "#34c759") : (dk ? "rgba(255,255,255,.25)" : "rgba(0,0,0,.2)") }}>
            {item.done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
          </div>
          <input
            ref={el => { if (el) inputRefs.current[item.id] = el; }}
            value={item.text}
            onChange={e => updateText(item.id, e.target.value)}
            onKeyDown={e => handleKey(e, item.id)}
            placeholder="To-do item…"
            style={{ ...bst.todoInput, color: dk ? "#f5f5f7" : "#1d1d1f", textDecoration: item.done ? "line-through" : "none", opacity: item.done ? 0.45 : 1 }}
          />
          <div onClick={() => removeItem(item.id)} style={{ ...bst.todoX, color: dk ? "rgba(255,255,255,.2)" : "rgba(0,0,0,.15)" }}><XSmall /></div>
        </div>
      ))}
    </div>
  );
}

function TableBlock({ block, onChange, dk }) {
  const update = (r, c, val) => { const rows = block.rows.map(row => [...row]); rows[r][c] = val; onChange(block.id, { ...block, rows }); };
  const addRow = () => onChange(block.id, { ...block, rows: [...block.rows, Array(block.rows[0]?.length || 2).fill("")] });
  const addCol = () => onChange(block.id, { ...block, rows: block.rows.map(r => [...r, ""]) });
  const bd = dk ? "rgba(255,255,255,.1)" : "rgba(0,0,0,.08)";
  return (
    <div style={bst.tableWrap}>
      <div style={{ overflowX: "auto", borderRadius: 12, border: `1px solid ${bd}` }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 200 }}>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr key={ri}>{row.map((cell, ci) => (
                <td key={ci} style={{ padding: 0, borderRight: ci < row.length - 1 ? `1px solid ${bd}` : "none", borderBottom: ri < block.rows.length - 1 ? `1px solid ${bd}` : "none" }}>
                  <input value={cell} onChange={e => update(ri, ci, e.target.value)} style={{ ...bst.tableCell, color: dk ? "#f5f5f7" : "#1d1d1f", fontWeight: ri === 0 ? 650 : 400, background: ri === 0 ? (dk ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.02)") : "transparent" }} />
                </td>
              ))}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <div onClick={addRow} style={{ ...bst.tableAdd, color: dk ? "rgba(255,255,255,.3)" : "rgba(0,0,0,.25)" }}><PlusRow /><span>Row</span></div>
        <div onClick={addCol} style={{ ...bst.tableAdd, color: dk ? "rgba(255,255,255,.3)" : "rgba(0,0,0,.25)" }}><PlusRow /><span>Column</span></div>
      </div>
    </div>
  );
}

function FileBlock({ block, onRemove, dk, onPreview }) {
  const isImg = ["png","jpg","jpeg","gif","webp","svg","bmp"].includes(block.ext?.toLowerCase());
  const isPdf = block.ext?.toLowerCase() === "pdf";
  const canPreview = (isImg || isPdf) && block.dataUrl;

  return (
    <div onClick={() => canPreview && onPreview(block)}
      style={{ ...bst.fileBlock, background: dk ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.02)", border: `1px solid ${dk ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.06)"}`, cursor: canPreview ? "pointer" : "default" }}
    >
      {isImg && block.dataUrl ? (
        <div style={bst.fileThumbnailWrap}><img src={block.dataUrl} alt={block.name} style={bst.fileThumbnail} /></div>
      ) : isPdf ? (
        <div style={{ ...bst.fileIconWrap, background: "#e74c3c15" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#e74c3c" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
      ) : (
        <div style={{ ...bst.fileIconWrap, background: dk ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.04)" }}>
          <span style={{ fontSize: 22 }}>{fileIcon(block.ext)}</span>
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: dk ? "#f5f5f7" : "#1d1d1f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{block.name}</p>
        <p style={{ fontSize: 11, color: dk ? "rgba(255,255,255,.35)" : "rgba(0,0,0,.35)", marginTop: 2 }}>{block.size} · {(block.ext || "file").toUpperCase()}</p>
        {canPreview && <p style={{ fontSize: 10, color: dk ? "rgba(255,255,255,.2)" : "rgba(0,0,0,.2)", marginTop: 3 }}>Tap to preview</p>}
      </div>
      <div onClick={e => { e.stopPropagation(); onRemove(block.id); }} style={{ cursor: "pointer", padding: 6, color: dk ? "rgba(255,255,255,.25)" : "rgba(0,0,0,.2)", flexShrink: 0 }}><XSmall /></div>
    </div>
  );
}

/* ═══ PDF RENDERER (pdf.js → canvas → images) ═══ */
function PdfPages({ dataUrl, width }) {
  const [pages, setPages] = useState([]);
  const [status, setStatus] = useState("loading");
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let dead = false;
    const go = async () => {
      try {
        if (!window.pdfjsLib) {
          await new Promise((ok, fail) => {
            const sc = document.createElement("script");
            sc.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
            sc.onload = ok; sc.onerror = fail;
            document.head.appendChild(sc);
          });
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        }
        const b64 = dataUrl.split(",")[1];
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        const pdf = await window.pdfjsLib.getDocument({ data: arr }).promise;
        if (dead) return;
        setTotal(pdf.numPages);
        setStatus("rendering");
        for (let i = 1; i <= pdf.numPages; i++) {
          if (dead) return;
          const pg = await pdf.getPage(i);
          const scale = ((width || 340) * 2) / pg.getViewport({ scale: 1 }).width;
          const vp = pg.getViewport({ scale });
          const cv = document.createElement("canvas");
          cv.width = vp.width; cv.height = vp.height;
          await pg.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
          if (!dead) setPages(prev => [...prev, { key: i, src: cv.toDataURL() }]);
        }
        if (!dead) setStatus("ok");
      } catch (e) {
        console.error("PDF render error:", e);
        if (!dead) setStatus("error");
      }
    };
    go();
    return () => { dead = true; };
  }, [dataUrl, width]);

  if (status === "loading") return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 48 }}>
      <div style={{ width: 30, height: 30, border: "3px solid rgba(255,255,255,.12)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
      <p style={{ color: "rgba(255,255,255,.55)", fontSize: 13 }}>Loading PDF…</p>
    </div>
  );
  if (status === "error") return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: 48 }}>
      <span style={{ fontSize: 48 }}>📄</span>
      <p style={{ color: "rgba(255,255,255,.55)", fontSize: 14, fontWeight: 600 }}>Could not render PDF</p>
    </div>
  );
  return (
    <div style={{ overflowY: "auto", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      {pages.map(p => (
        <div key={p.key} style={{ position: "relative", width: "100%" }}>
          <img src={p.src} alt={`Page ${p.key}`} style={{ width: "100%", borderRadius: 8, boxShadow: "0 4px 20px rgba(0,0,0,.3)", display: "block" }} />
          <div style={{ position: "absolute", bottom: 8, right: 10, background: "rgba(0,0,0,.55)", borderRadius: 8, padding: "3px 10px", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,.75)" }}>{p.key} / {total}</div>
        </div>
      ))}
      {status === "rendering" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 0 24px" }}>
          <div style={{ width: 18, height: 18, border: "2px solid rgba(255,255,255,.12)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
          <p style={{ color: "rgba(255,255,255,.45)", fontSize: 12 }}>Rendering page {pages.length + 1} of {total}…</p>
        </div>
      )}
    </div>
  );
}

/* ═══ FILE PREVIEW MODAL ═══ */
function FilePreviewModal({ block, dk, onClose, borderR, isDesktop }) {
  if (!block) return null;
  const isImg = ["png","jpg","jpeg","gif","webp","svg","bmp"].includes(block.ext?.toLowerCase());
  const isPdf = block.ext?.toLowerCase() === "pdf";

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 500, borderRadius: borderR || 0,
      background: dk ? "rgba(0,0,0,.92)" : "rgba(0,0,0,.82)",
      backdropFilter: "blur(30px)", WebkitBackdropFilter: "blur(30px)",
      display: "flex", flexDirection: "column",
      animation: "vf .25s ease both", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: `${isDesktop ? 20 : 56}px 20px 12px`, flexShrink: 0,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 15, fontWeight: 650, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{block.name}</p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,.5)", marginTop: 2 }}>{block.size} · {(block.ext || "file").toUpperCase()}</p>
        </div>
        <div onClick={onClose} style={{
          width: 34, height: 34, borderRadius: 17, background: "rgba(255,255,255,.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", flexShrink: 0, marginLeft: 12, color: "#fff",
        }}><XI /></div>
      </div>
      {/* Content */}
      <div style={{ flex: 1, display: "flex", alignItems: isPdf ? "flex-start" : "center", justifyContent: "center", padding: "0 12px 24px", overflow: isPdf ? "auto" : "hidden" }}>
        {isImg && block.dataUrl ? (
          <img src={block.dataUrl} alt={block.name} style={{
            maxWidth: "100%", maxHeight: "100%", borderRadius: 12,
            boxShadow: "0 20px 60px rgba(0,0,0,.5)", objectFit: "contain",
          }} />
        ) : isPdf && block.dataUrl ? (
          <PdfPages dataUrl={block.dataUrl} width={340} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 56 }}>{fileIcon(block.ext)}</span>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>No preview available</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* Block editor styles */
const bst = {
  textBlock: { fontSize: 16, lineHeight: 1.7, fontFamily: "inherit", minHeight: 24, outline: "none", wordBreak: "break-word" },
  todoBlock: { marginBottom: 4 },
  todoRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6 },
  todoCheck: { width: 22, height: 22, borderRadius: 6, border: "2px solid", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, transition: "all .2s ease" },
  todoInput: { flex: 1, border: "none", background: "transparent", fontSize: 15, fontFamily: "inherit", transition: "opacity .2s ease" },
  todoX: { cursor: "pointer", padding: 2, flexShrink: 0 },
  todoAdd: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 550, cursor: "pointer", padding: "4px 0", marginTop: 2 },
  tableWrap: { marginBottom: 4 },
  tableCell: { width: "100%", border: "none", background: "transparent", fontSize: 13, fontFamily: "inherit", padding: "9px 12px", outline: "none" },
  tableAdd: { display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 550, cursor: "pointer", padding: "3px 0" },
  fileBlock: { display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 16, transition: "transform .15s ease" },
  fileThumbnailWrap: { width: 52, height: 52, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: "rgba(0,0,0,.04)" },
  fileThumbnail: { width: "100%", height: "100%", objectFit: "cover" },
  fileIconWrap: { width: 52, height: 52, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
};

/* ═══ SWIPEABLE CARD ═══ */
function SwipeCard({ note, idx, folders, onClick, showF, dk, onDelete, onAssignFolder, onPickFolder, theme }) {
  const p = PALETTES[note.color]; const f = showF && note.folderId ? folders.find(x => x.id === note.folderId) : null;
  const [offX, setOffX] = useState(0); const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState(false);
  const sx = useRef(0); const sy = useRef(0); const cx = useRef(0); const locked = useRef(false); const isH = useRef(null);
  const TH = 80, DF = 280;
  const hStart = (x, y) => { sx.current = x; sy.current = y; cx.current = 0; locked.current = false; isH.current = null; setDragging(true); };
  const hMove = (x, y) => { if (!dragging || locked.current) return; const dx = x - sx.current, dy = y - sy.current; if (isH.current === null) { if (Math.abs(dx) > 8 || Math.abs(dy) > 8) { isH.current = Math.abs(dx) > Math.abs(dy); if (!isH.current) { locked.current = true; setDragging(false); return; } } else return; } cx.current = dx; setOffX(dx > 0 ? Math.min(dx * .55, 140) : Math.max(dx * .55, -DF)); };
  const hEnd = () => { if (!dragging) return; setDragging(false); const dx = cx.current; if (dx > TH) { setOffX(0); onPickFolder(note.id); } else if (dx < -TH) { setOffX(-DF); setRemoving(true); setTimeout(() => onDelete(note.id), 350); } else setOffX(0); };
  useEffect(() => { if (dragging) { const mm = e => hMove(e.clientX, e.clientY); const mu = () => hEnd(); window.addEventListener("mousemove", mm); window.addEventListener("mouseup", mu); return () => { window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); }; } }, [dragging]);
  const hClick = () => { if (Math.abs(cx.current) < 5) onClick(); };
  const rR = Math.max(0, offX), lR = Math.abs(Math.min(0, offX)), dp = Math.min(lR / DF, 1);
  const cr = theme.cardRadius;
  const cardBg = theme.cardStyle === "glass" ? (dk ? "rgba(255,255,255,.06)" : p.bg) :
                 theme.cardStyle === "solid" ? (dk ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.75)") :
                 theme.cardStyle === "paper" ? (dk ? "rgba(255,255,255,.06)" : "#fffdf7") :
                 (dk ? "rgba(255,255,255,.06)" : "#fff");
  const cardBorder = theme.cardStyle === "solid" ? `1.5px solid ${dk ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.1)"}` :
                     theme.cardStyle === "paper" ? `1px dashed ${dk ? "rgba(255,255,255,.12)" : "rgba(140,120,90,.2)"}` :
                     `1px solid ${dk ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.04)"}`;
  const cardShadow = theme.cardStyle === "shadow" ? (dk ? "none" : "0 2px 12px rgba(108,92,231,.08)") :
                     theme.cardStyle === "paper" ? (dk ? "none" : "1px 2px 0 rgba(140,120,90,.06)") : "none";
  const cardBlur = theme.cardStyle === "glass" ? "blur(20px)" : "none";
  return (
    <div style={{ position: "relative", marginBottom: 14, borderRadius: cr, overflow: "hidden", animation: "fu .5s cubic-bezier(.23,1,.32,1) both", animationDelay: `${idx * .05}s`, opacity: removing ? 0 : 1, maxHeight: removing ? 0 : 300, transition: removing ? "opacity .3s ease,max-height .35s ease .05s" : "none" }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg,#34c759,#30b350)", borderRadius: cr, display: "flex", alignItems: "center", paddingLeft: 20, opacity: rR > 10 ? 1 : 0, transition: "opacity .15s" }}><div style={{ display: "flex", alignItems: "center", gap: 8, color: "#fff" }}><FolderSvg /><span style={{ fontSize: 14, fontWeight: 650, fontFamily: theme.uiFont }}>Move to…</span></div></div>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg,#ff3b30,#e0322b)", borderRadius: cr, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 20, opacity: lR > 10 ? 1 : 0, transition: "opacity .15s" }}><div style={{ display: "flex", alignItems: "center", gap: 8, color: "#fff", transform: `scale(${.8 + dp * .4})` }}><span style={{ fontSize: 14, fontWeight: 650, fontFamily: theme.uiFont }}>{dp > .7 ? "Release" : "Delete"}</span><TrashSvg /></div></div>
      <div onTouchStart={e => hStart(e.touches[0].clientX, e.touches[0].clientY)} onTouchMove={e => hMove(e.touches[0].clientX, e.touches[0].clientY)} onTouchEnd={hEnd} onMouseDown={e => { e.preventDefault(); hStart(e.clientX, e.clientY); }} onClick={hClick} style={{ position: "relative", zIndex: 2, padding: "18px 20px", borderRadius: cr, background: cardBg, border: cardBorder, boxShadow: cardShadow, backdropFilter: cardBlur, WebkitBackdropFilter: cardBlur, transform: `translateX(${offX}px)`, transition: dragging ? "none" : "transform .4s cubic-bezier(.23,1,.32,1)", cursor: "grab", userSelect: "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <h3 style={{ fontSize: theme.id === "diary" ? 23 : 19, fontWeight: theme.headWeight, lineHeight: 1.25, letterSpacing: theme.headSpacing, flex: 1, color: dk ? "#f5f5f7" : (theme.cardStyle === "solid" || theme.cardStyle === "paper" ? theme.accentColor : p.accent), fontFamily: theme.headFont }}>{note.title || "Untitled"}</h3>
          {note.pinned && <span style={{ color: dk ? "#f5f5f7" : p.accent, opacity: .5 }}><PinI filled /></span>}
        </div>
        <p style={{ fontSize: theme.id === "diary" ? 18 : 15, color: dk ? "rgba(255,255,255,.35)" : (theme.id === "diary" ? "rgba(90,74,58,.5)" : "rgba(0,0,0,.4)"), lineHeight: 1.45, marginTop: 6, fontFamily: theme.bodyFont }}>{excerpt(note.blocks)}</p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
          <span style={{ fontSize: theme.id === "diary" ? 15 : 13, color: dk ? "rgba(255,255,255,.2)" : (theme.id === "diary" ? "rgba(90,74,58,.3)" : "rgba(0,0,0,.25)"), fontWeight: 500, fontFamily: theme.uiFont }}>{fmtDate(note.date)}</span>
          {f && <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 10px 3px 8px", borderRadius: cr / 2, background: dk ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.03)" }}><div style={{ width: 7, height: 7, borderRadius: 4, background: f.color }} /><span style={{ color: f.color, fontSize: 12, fontWeight: 600, fontFamily: theme.uiFont }}>{f.name}</span></div>}
        </div>
      </div>
    </div>
  );
}

/* ═══ STACKED CARD LIST (iOS Notification Style) ═══ */
function StackedCardList({ notes, pinned, unpinned, folders, activeF, dk, theme, C, onOpen, onDelete, onAssignFolder, onPickFolder, searchQ }) {
  const scrollRef = useRef(null);
  const [scrollY, setScrollY] = useState(0);

  const allCards = [];
  if (pinned.length > 0) {
    allCards.push({ type: "label", key: "lbl-pin", text: "Pinned" });
    pinned.forEach((n, i) => allCards.push({ type: "card", key: n.id, note: n, idx: allCards.length }));
  }
  if (unpinned.length > 0) {
    if (pinned.length > 0) allCards.push({ type: "label", key: "lbl-notes", text: "Notes" });
    unpinned.forEach((n, i) => allCards.push({ type: "card", key: n.id, note: n, idx: allCards.length }));
  }

  const handleScroll = useCallback(e => setScrollY(e.target.scrollTop), []);

  if (notes.length === 0) {
    return (
      <div style={{ flex: 1, padding: "0 24px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 80 }}>
          <div style={{ fontSize: 40, color: C.muted, marginBottom: 16 }}>{theme.id === "editorial" ? "§" : theme.id === "diary" ? "✎" : "✦"}</div>
          <p style={{ fontSize: theme.id === "diary" ? 24 : 18, fontWeight: theme.headWeight, color: C.soft, fontFamily: theme.headFont }}>{searchQ ? "No notes found" : "No notes yet"}</p>
          <p style={{ fontSize: theme.id === "diary" ? 18 : 14, color: C.muted, marginTop: 4, fontFamily: theme.bodyFont }}>{searchQ ? "Try a different search" : "Tap + to create one"}</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} onScroll={handleScroll} style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "4px 18px 0", position: "relative" }}>
      <div style={{ padding: "2px 2px 6px", display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 11, color: C.muted }}>← delete</span><span style={{ fontSize: 11, color: C.muted }}>move →</span></div>
      {allCards.map(item => {
        if (item.type === "label") return <p key={item.key} style={{ fontSize: 13, fontWeight: 650, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8, color: C.muted, fontFamily: theme.uiFont }}>{item.text}</p>;
        return (
          <StackedCard key={item.key} note={item.note} idx={item.idx} scrollRef={scrollRef} scrollY={scrollY}
            folders={folders} activeF={activeF} dk={dk} theme={theme}
            onOpen={onOpen} onDelete={onDelete} onAssignFolder={onAssignFolder} onPickFolder={onPickFolder} />
        );
      })}
      <div style={{ height: 120 }} />
    </div>
  );
}

/* Single card with stack physics */
function StackedCard({ note, idx, scrollRef, scrollY, folders, activeF, dk, theme, onOpen, onDelete, onAssignFolder, onPickFolder }) {
  const ref = useRef(null);
  const [style, setStyle] = useState({});

  useEffect(() => {
    const el = ref.current;
    const container = scrollRef.current;
    if (!el || !container) return;

    const cardRect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const relTop = cardRect.top - containerRect.top; // position relative to scroll viewport top
    const cardH = cardRect.height || 110;
    const viewH = containerRect.height;

    // === BOTTOM STACK: cards below visible area compress into a pile ===
    const bottomEdge = viewH - 140; // where bottom stack starts (above FAB)
    if (relTop > bottomEdge) {
      const overBy = relTop - bottomEdge;
      const maxOver = 200;
      const p = Math.min(overBy / maxOver, 1);
      const scl = 1 - p * 0.08;
      const pushUp = overBy * 0.85;
      setStyle({
        transform: `translateY(-${pushUp}px) scale(${scl})`,
        opacity: Math.max(1 - p * 0.8, 0),
        zIndex: 50 - idx,
        transition: "none",
        transformOrigin: "center bottom",
        pointerEvents: p > 0.3 ? "none" : "auto",
      });
      return;
    }

    // === TOP STACK: cards scrolling above compress upward ===
    if (relTop < -10) {
      const gone = Math.abs(relTop);
      const maxGone = cardH * 1.5;
      const p = Math.min(gone / maxGone, 1);
      const scl = 1 - p * 0.1;
      const pushDown = gone * (1 - p * 0.6);
      setStyle({
        transform: `translateY(${pushDown}px) scale(${scl})`,
        opacity: Math.max(1 - p, 0),
        zIndex: idx + 100,
        transition: "none",
        transformOrigin: "center top",
        pointerEvents: p > 0.5 ? "none" : "auto",
      });
      return;
    }

    // === VISIBLE: normal ===
    setStyle({
      transform: "translateY(0) scale(1)",
      opacity: 1,
      zIndex: 100 - idx,
      transition: "transform .2s ease, opacity .2s ease",
      transformOrigin: "center center",
    });
  }, [scrollY, idx]);

  return (
    <div ref={ref} style={{ position: "relative", ...style }}>
      <SwipeCard
        note={note} idx={0} folders={folders}
        onClick={() => onOpen(note)} showF={!activeF} dk={dk}
        onDelete={onDelete} onAssignFolder={onAssignFolder}
        onPickFolder={onPickFolder} theme={theme}
      />
    </div>
  );
}

/* ═══ STORAGE LAYER ═══ */
function serializeNotes(notes) {
  return notes.map(n => ({
    ...n,
    date: n.date instanceof Date ? n.date.toISOString() : n.date,
    blocks: n.blocks.map(b => {
      if (b.type === "file" && b.dataUrl && b.dataUrl.length > 500000) {
        return { ...b, dataUrl: null, _hadFile: true };
      }
      return b;
    }),
  }));
}

function deserializeNotes(raw) {
  return raw.map(n => ({
    ...n,
    date: new Date(n.date),
  }));
}

/* ═══ LOGIN SCREEN ═══ */
function LoginScreen({ onGoogleSignIn, loading, error }) {
  return (
    <div style={{ width: "100%", height: "100%", background: "linear-gradient(145deg, #faf9f7 0%, #f0e8d8 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Source Serif 4',Georgia,serif", position: "relative", overflow: "hidden" }}>
      {/* Decorative circles */}
      <div style={{ position: "absolute", top: "-15%", right: "-10%", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(232,164,73,.12) 0%, transparent 70%)" }} />
      <div style={{ position: "absolute", bottom: "-10%", left: "-5%", width: 250, height: 250, borderRadius: "50%", background: "radial-gradient(circle, rgba(74,125,189,.1) 0%, transparent 70%)" }} />

      {/* Logo area */}
      <div style={{ marginBottom: 32, textAlign: "center", zIndex: 1 }}>
        <h1 style={{ fontSize: 42, fontWeight: 700, color: "#1d1d1f", letterSpacing: -1.5, marginBottom: 8, fontFamily: "'Source Serif 4',Georgia,serif" }}>Aeris</h1>
        <p style={{ fontSize: 16, color: "rgba(0,0,0,.4)", maxWidth: 260, lineHeight: 1.5 }}>Your thoughts, beautifully organized and synced everywhere.</p>
      </div>

      {/* Sign in button */}
      <div style={{ zIndex: 1, width: "100%", maxWidth: 300, padding: "0 32px" }}>
        <button onClick={onGoogleSignIn} disabled={loading} style={{
          width: "100%", padding: "14px 20px", borderRadius: 14, border: "none",
          background: "#fff", cursor: loading ? "wait" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
          boxShadow: "0 2px 12px rgba(0,0,0,.08), 0 0 0 1px rgba(0,0,0,.04)",
          transition: "transform .15s ease, box-shadow .15s ease",
          fontSize: 16, fontWeight: 600, color: "#1d1d1f", fontFamily: "-apple-system, sans-serif",
        }}
        onMouseDown={e => e.currentTarget.style.transform = "scale(.97)"}
        onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
        onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
        >
          {loading ? (
            <div style={{ width: 20, height: 20, border: "2.5px solid rgba(0,0,0,.1)", borderTopColor: "#1d1d1f", borderRadius: "50%", animation: "spin .6s linear infinite" }} />
          ) : (
            <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#34A853" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#FBBC05" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          )}
          <span>{loading ? "Signing in…" : "Continue with Google"}</span>
        </button>

        {error && <p style={{ color: "#ff3b30", fontSize: 13, textAlign: "center", marginTop: 12 }}>{error}</p>}
      </div>

      {/* Footer */}
      <p style={{ position: "absolute", bottom: 24, fontSize: 11, color: "rgba(0,0,0,.2)", letterSpacing: 1, textTransform: "uppercase", fontFamily: "-apple-system, sans-serif" }}>Secure · Private · Synced</p>
    </div>
  );
}

/* ═══ AUTH WRAPPER (default export) ═══ */
export default function AppWrapper() {
  const [fb, setFb] = useState(null);       // { app, auth, db }
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [signInLoading, setSignInLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth > 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Load Firebase and listen for auth state
  useEffect(() => {
    (async () => {
      const firebaseInstance = await initFirebase();
      if (firebaseInstance) {
        setFb(firebaseInstance);
        firebaseInstance.auth.onAuthStateChanged(u => {
          setUser(u);
          setAuthLoading(false);
        });
      } else {
        setAuthLoading(false);
      }
    })();
  }, []);

  const handleGoogleSignIn = async () => {
    if (!fb) return;
    setSignInLoading(true);
    setAuthError(null);
    try {
      await signInWithGoogle(fb.auth);
    } catch (e) {
      if (e.code !== "auth/popup-closed-by-user") {
        setAuthError("Sign in failed. Try again.");
      }
    }
    setSignInLoading(false);
  };

  const handleSignOut = async () => {
    if (fb?.auth) await fb.auth.signOut();
  };

  const shell = (content) => (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "relative" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      {content}
    </div>
  );

  // Loading screen
  if (authLoading) {
    return shell(
      <div style={{ width: "100%", height: "100%", background: "#faf9f7", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <div style={{ width: 28, height: 28, border: "3px solid rgba(0,0,0,.08)", borderTopColor: "rgba(0,0,0,.4)", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
        <p style={{ fontSize: 14, color: "rgba(0,0,0,.3)", fontWeight: 500, fontFamily: "'Source Serif 4',Georgia,serif" }}>Loading…</p>
      </div>
    );
  }

  // Not signed in — show login
  if (!user) {
    return shell(<LoginScreen onGoogleSignIn={handleGoogleSignIn} loading={signInLoading} error={authError} />);
  }

  // Signed in — show app
  return <NotesApp user={user} fb={fb} isDesktop={isDesktop} onSignOut={handleSignOut} />;
}

/* ═══ MAIN APP ═══ */
function NotesApp({ user, fb, isDesktop, onSignOut }) {
  const [notes, setNotes] = useState(SAMPLE_NOTES);
  const [folders, setFolders] = useState(DEFAULT_FOLDERS);
  const [loaded, setLoaded] = useState(false);
  const [selId, setSelId] = useState(null);
  const [activeF, setActiveF] = useState(null);
  const [searchQ, setSearchQ] = useState("");
  const [searchOn, setSearchOn] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBlocks, setEditBlocks] = useState([]);
  const [showCP, setShowCP] = useState(false);
  const [showFP, setShowFP] = useState(false);
  const [animIn, setAnimIn] = useState(false);
  const [view, setView] = useState("list");
  const [sideOpen, setSideOpen] = useState(false);
  const [setOpen, setSetOpen] = useState(false);
  const [dk, setDk] = useState(false);
  const [themeId, setThemeId] = useState("minimal");
  const [nfMode, setNfMode] = useState(false);
  const [nfName, setNfName] = useState("");
  const titleRef = useRef(null);
  const searchRef = useRef(null);
  const nfRef = useRef(null);
  const fileRef = useRef(null);
  const lastTextRef = useRef(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [pickingNote, setPickingNote] = useState(null);

  // ── Responsive: isDesktop is now a prop ──

  const selNote = notes.find(n => n.id === selId);
  const theme = THEMES.find(t => t.id === themeId) || THEMES[0];

  // ── Load from Firestore on mount ──
  useEffect(() => {
    if (!fb?.db || !user?.uid) { setLoaded(true); return; }
    (async () => {
      const data = await loadFromFirestore(fb.db, user.uid);
      if (data && data.notes.length > 0) {
        setNotes(data.notes);
        setFolders(data.folders);
        setDk(data.settings.dk || false);
        setThemeId(data.settings.themeId || "minimal");
      }
      setLoaded(true);
    })();
  }, [fb, user]);

  // ── Save system ──
  const saveTimer = useRef(null);
  const [saveStatus, setSaveStatus] = useState(""); // "" | "saving" | "saved" | "error"

  // Save function that takes explicit data (avoids stale refs)
  const [saveError, setSaveError] = useState("");
  const doSave = useCallback(async (n, f, d, t) => {
    if (!fb?.db || !user?.uid) return;
    setSaveStatus("saving");
    const result = await saveToFirestore(fb.db, user.uid, n, f, { dk: d, themeId: t });
    if (result.ok) {
      setSaveStatus("saved");
      setSaveError("");
    } else {
      setSaveStatus("error");
      setSaveError(result.error || "Unknown error");
    }
    setTimeout(() => setSaveStatus(""), result.ok ? 3000 : 8000);
  }, [fb, user]);

  // Auto-save on state changes (debounced)
  useEffect(() => {
    if (!loaded || !fb?.db || !user?.uid) return;
    // Immediate localStorage save (never loses data)
    try {
      const data = JSON.stringify({ notesJson: JSON.stringify(serializeNotes(notes)), foldersJson: JSON.stringify(folders), settings: { dk, themeId }, v: 2, savedAt: new Date().toISOString() });
      localStorage.setItem("aeris-" + user.uid, data);
    } catch(e) {}
    // Debounced Firestore save
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(notes, folders, dk, themeId), 1500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [notes, folders, dk, themeId, loaded, fb, user, doSave]);

  // Save on page close
  useEffect(() => {
    if (!fb?.db || !user?.uid) return;
    const handleUnload = () => {
      try {
        const data = JSON.stringify({ notesJson: JSON.stringify(serializeNotes(notes)), foldersJson: JSON.stringify(folders), settings: { dk, themeId }, v: 2, savedAt: new Date().toISOString() });
        localStorage.setItem("aeris-" + user.uid, data);
      } catch(e) {}
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [notes, folders, dk, themeId, fb, user]);

  const C = {
    phoneBg: dk ? "#1c1c1e" : theme.phoneBg, rootBg: dk ? "#000" : theme.rootBg,
    text: dk ? "#f5f5f7" : "#1d1d1f", soft: dk ? "rgba(255,255,255,.45)" : "rgba(0,0,0,.35)",
    muted: dk ? "rgba(255,255,255,.22)" : "rgba(0,0,0,.22)",
    searchBg: dk ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.04)",
    overlay: dk ? "rgba(0,0,0,.65)" : "rgba(0,0,0,.32)",
    panelBg: dk ? "#2c2c2e" : "#fff", divider: dk ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.06)",
    fabBg: dk ? "#f5f5f7" : theme.accentColor, fabC: dk ? "#1c1c1e" : "#fff",
    active: dk ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.05)",
    accent: dk ? "#f5f5f7" : theme.accentColor,
    check: theme.checkColor,
  };
  const T = theme; // shorthand

  const getFilt = useCallback((fId) => {
    let pool = notes;
    if (fId === "__uncat") pool = notes.filter(n => !n.folderId);
    else if (fId) pool = notes.filter(n => n.folderId === fId);
    if (searchQ) { const q = searchQ.toLowerCase(); pool = pool.filter(n => n.title.toLowerCase().includes(q) || blocksToText(n.blocks).toLowerCase().includes(q)); }
    return pool.sort((a, b) => { if (a.pinned !== b.pinned) return a.pinned ? -1 : 1; return b.date - a.date; });
  }, [notes, searchQ]);

  const filtered = getFilt(activeF);
  const pinned = filtered.filter(n => n.pinned);
  const unpinned = filtered.filter(n => !n.pinned);

  useEffect(() => { if (searchOn && searchRef.current) searchRef.current.focus(); }, [searchOn]);
  useEffect(() => { if (nfMode && nfRef.current) nfRef.current.focus(); }, [nfMode]);

  const openNote = useCallback(note => {
    setSelId(note.id); setEditTitle(note.title);
    const blocks = JSON.parse(JSON.stringify(note.blocks || []));
    const last = blocks[blocks.length - 1];
    if (!last || last.type !== "text") blocks.push(mkTxt(""));
    setEditBlocks(blocks);
    setShowCP(false); setShowFP(false);
    setView("editor"); setTimeout(() => setAnimIn(true), 30);
  }, []);

  const closeNote = useCallback(() => {
    setAnimIn(false);
    const tt = editTitle.trim();
    // Clean blocks: remove trailing empty text blocks for storage
    let cleanBlocks = [...editBlocks];
    while (cleanBlocks.length > 0) {
      const last = cleanBlocks[cleanBlocks.length - 1];
      if (last.type === "text" && last.html.replace(/<[^>]+>/g, "").trim() === "" && cleanBlocks.length > 1) cleanBlocks.pop();
      else break;
    }
    const hasContent = tt || cleanBlocks.some(b => { if (b.type === "text") return b.html.replace(/<[^>]+>/g, "").trim(); if (b.type === "todo") return b.items.length > 0; if (b.type === "table") return true; if (b.type === "file") return true; return false; });
    if (!hasContent) setNotes(p => p.filter(n => n.id !== selId));
    else setNotes(p => p.map(n => n.id === selId ? { ...n, title: tt || "Untitled", blocks: cleanBlocks, date: new Date() } : n));
    setTimeout(() => { setSelId(null); setView("list"); }, 300);
  }, [editTitle, editBlocks, selId]);

  const createNote = useCallback(() => {
    const nn = { id: Date.now(), title: "", blocks: [mkTxt("")], date: new Date(), color: 0, pinned: false, folderId: activeF === "__uncat" ? null : activeF };
    setNotes(p => [nn, ...p]); openNote(nn); setTimeout(() => titleRef.current?.focus(), 400);
  }, [activeF, openNote]);

  const delNote = useCallback(id => setNotes(p => p.filter(n => n.id !== id)), []);
  const delSel = useCallback(() => { setAnimIn(false); setTimeout(() => { setNotes(p => p.filter(n => n.id !== selId)); setSelId(null); setView("list"); }, 300); }, [selId]);
  const togPin = useCallback(() => setNotes(p => p.map(n => n.id === selId ? { ...n, pinned: !n.pinned } : n)), [selId]);
  const setCol = useCallback(c => { setNotes(p => p.map(n => n.id === selId ? { ...n, color: c } : n)); setShowCP(false); }, [selId]);
  const assignFEd = useCallback(fId => { setNotes(p => p.map(n => n.id === selId ? { ...n, folderId: fId } : n)); setShowFP(false); }, [selId]);
  const assignFSw = useCallback((nid, fId) => setNotes(p => p.map(n => n.id === nid ? { ...n, folderId: fId } : n)), []);
  const cntFor = fId => notes.filter(n => n.folderId === fId).length;
  const uncatCnt = notes.filter(n => !n.folderId).length;

  const addFolder = useCallback(() => {
    const name = nfName.trim(); if (!name) { setNfMode(false); return; }
    setFolders(p => [...p, { id: name.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now(), name, icon: FIcon[p.length % FIcon.length], color: FC[p.length % FC.length] }]);
    setNfName(""); setNfMode(false);
  }, [nfName]);

  const pickF = fId => { setActiveF(fId); setSearchQ(""); setSearchOn(false); setSideOpen(false); };
  const curF = folders.find(f => f.id === activeF);
  const hLabel = activeF === "__uncat" ? "Uncategorized" : !activeF ? "Aeris" : curF?.name || "Aeris";

  /* ── Block editing ── */
  const updateBlock = useCallback((blockId, newBlock) => setEditBlocks(p => p.map(b => b.id === blockId ? newBlock : b)), []);
  const removeBlock = useCallback(blockId => setEditBlocks(p => {
    const filtered = p.filter(b => b.id !== blockId);
    const last = filtered[filtered.length - 1];
    if (!last || last.type !== "text") filtered.push(mkTxt(""));
    return filtered;
  }), []);
  const addTextBlock = () => setEditBlocks(p => [...p, mkTxt("")]);
  const addTodoBlock = () => {
    const firstItemId = "t" + uid();
    const newBlock = { id: uid(), type: "todo", items: [{ id: firstItemId, text: "", done: false }], _focusId: firstItemId };
    const afterText = mkTxt("");
    setEditBlocks(p => { const cleaned = p.filter(b => !(b.type === "text" && b.html.replace(/<[^>]+>/g, "").trim() === "" && p.indexOf(b) === p.length - 1)); return [...cleaned, newBlock, afterText]; });
  };
  const addTableBlock = () => {
    const afterText = mkTxt("");
    setEditBlocks(p => { const cleaned = p.filter(b => !(b.type === "text" && b.html.replace(/<[^>]+>/g, "").trim() === "" && p.indexOf(b) === p.length - 1)); return [...cleaned, mkTable([["", ""], ["", ""]]), afterText]; });
  };
  const addFileBlock = () => fileRef.current?.click();
  const handleFileChange = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const size = file.size < 1024 * 1024 ? (file.size / 1024).toFixed(0) + " KB" : (file.size / (1024 * 1024)).toFixed(1) + " MB";
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result || null;
      const afterText = mkTxt("");
      setEditBlocks(p => {
        const cleaned = p.filter(b => !(b.type === "text" && b.html.replace(/<[^>]+>/g, "").trim() === "" && p.indexOf(b) === p.length - 1));
        return [...cleaned, mkFile(file.name, size, ext, dataUrl), afterText];
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };
  const doFormat = (cmd) => {
    if (cmd === "highlight") {
      document.execCommand("hiliteColor", false, "#ffe066");
    } else if (cmd === "underline") {
      document.execCommand("underline", false, null);
    }
  };

  // ── Loading screen ──
  const R = 0; // no border radius - fullscreen always

  if (!loaded) {
    return (
      <div style={{ width: "100vw", height: "100vh" }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ width: "100%", height: "100%", background: "#faf9f7", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
          <div style={{ width: 28, height: 28, border: "3px solid rgba(0,0,0,.08)", borderTopColor: "rgba(0,0,0,.4)", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
          <p style={{ fontSize: 14, color: "rgba(0,0,0,.3)", fontWeight: 500, fontFamily: "'Source Serif 4',Georgia,serif" }}>Loading your notes…</p>
        </div>
      </div>
    );
  }

  // ═══ App content (shared between phone & desktop) ═══
  const appContent = (
    <div style={{ width: "100%", height: "100%", borderRadius: R, overflow: "hidden", position: "relative", transition: "background .5s", background: C.phoneBg }}>
      {/* No status bar - real browser provides its own */}

      {/* SIDEBAR */}
      {sideOpen && <div className="ov" style={{ ...s.ov, background: C.overlay, borderRadius: R }} onClick={() => { setSideOpen(false); setNfMode(false); }} />}
      <div style={{ ...s.side, background: C.panelBg, transform: sideOpen ? "translateX(0)" : "translateX(-100%)", borderRadius: 0, width: isDesktop ? 320 : "85%", maxWidth: isDesktop ? 320 : "none" }}>
          <div style={{ ...s.pH, paddingTop: isDesktop ? 24 : 48 }}><h2 style={{ ...s.pT, color: C.text, fontFamily: T.headFont, fontWeight: T.headWeight, fontSize: T.id === "diary" ? 32 : 26 }}>Projects</h2><div className="tb" style={s.xB} onClick={() => { setSideOpen(false); setNfMode(false); }}><XI /></div></div>
          <div style={s.pS}>
            <div className="sr" style={{ ...s.sr, background: !activeF ? C.active : "transparent" }} onClick={() => pickF(null)}><div style={s.srL}><div style={{ ...s.srD, background: dk ? "rgba(255,255,255,.1)" : "rgba(0,0,0,.07)" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg></div><span style={{ ...s.srN, color: C.text, fontWeight: !activeF ? 650 : 500 }}>All Notes</span></div><span style={{ ...s.srC, color: C.soft }}>{notes.length}</span></div>
            {uncatCnt > 0 && <div className="sr" style={{ ...s.sr, background: activeF === "__uncat" ? C.active : "transparent" }} onClick={() => pickF("__uncat")}><div style={s.srL}><div style={{ ...s.srD, background: dk ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.05)" }}><span style={{ fontSize: 13, color: C.soft }}>○</span></div><span style={{ ...s.srN, color: C.text, fontWeight: activeF === "__uncat" ? 650 : 500 }}>Uncategorized</span></div><span style={{ ...s.srC, color: C.soft }}>{uncatCnt}</span></div>}
            <div style={{ height: 1, background: C.divider, margin: "10px 14px" }} />
            {folders.map(f => <div key={f.id} className="sr" style={{ ...s.sr, background: activeF === f.id ? C.active : "transparent" }} onClick={() => pickF(f.id)}><div style={s.srL}><div style={{ ...s.srD, background: f.color + "18", color: f.color }}><span style={{ fontSize: 13 }}>{f.icon}</span></div><span style={{ ...s.srN, color: C.text, fontWeight: activeF === f.id ? 650 : 500 }}>{f.name}</span></div><span style={{ ...s.srC, color: C.soft }}>{cntFor(f.id)}</span></div>)}
            {nfMode ? <div style={s.sr}><div style={s.srL}><div style={{ ...s.srD, background: "transparent", color: C.soft }}><SmPlus /></div><input ref={nfRef} style={{ ...s.nfI, color: C.text }} value={nfName} onChange={e => setNfName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addFolder(); if (e.key === "Escape") setNfMode(false); }} onBlur={addFolder} placeholder="Project name…" /></div></div> : <div className="sr" style={s.sr} onClick={() => setNfMode(true)}><div style={s.srL}><div style={{ ...s.srD, background: "transparent", color: C.soft }}><SmPlus /></div><span style={{ ...s.srN, color: C.soft }}>New Project</span></div></div>}
          </div>
        </div>

        {/* SETTINGS */}
        {setOpen && <div className="ov" style={{ ...s.ov, background: C.overlay, borderRadius: R }} onClick={() => setSetOpen(false)} />}
        <div style={{ ...s.sett, background: C.panelBg, transform: setOpen ? "translateX(0)" : "translateX(100%)", borderRadius: 0, width: isDesktop ? 360 : "88%", maxWidth: isDesktop ? 360 : "none" }}>
          <div style={{ ...s.pH, paddingTop: isDesktop ? 24 : 48 }}><h2 style={{ ...s.pT, color: C.text, fontFamily: T.headFont, fontWeight: T.headWeight, fontSize: T.id === "diary" ? 32 : 26 }}>Settings</h2><div className="tb" style={s.xB} onClick={() => setSetOpen(false)}><XI /></div></div>
          <div style={s.pS}>
            <p style={{ ...s.sL, color: C.soft }}>Account</p>
            <div style={{ ...s.sC, background: dk ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.03)" }}><div style={{ display: "flex", alignItems: "center", gap: 14, padding: 16 }}><div style={{ width: 44, height: 44, borderRadius: 22, background: dk ? "rgba(255,255,255,.1)" : "rgba(0,0,0,.06)", display: "flex", alignItems: "center", justifyContent: "center", color: C.text }}><UserI /></div><div><p style={{ fontSize: 16, fontWeight: 600, color: C.text }}>Your Name</p><p style={{ fontSize: 12, color: C.soft, marginTop: 1 }}>name@email.com</p></div></div></div>
            <p style={{ ...s.sL, color: C.soft, marginTop: 24 }}>Appearance</p>
            <div style={{ ...s.sC, background: dk ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.03)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}><div style={{ display: "flex", alignItems: "center", gap: 10, color: C.text }}>{dk ? <Moon /> : <SunI />}<span style={{ fontSize: 15, fontWeight: 550 }}>{dk ? "Dark Mode" : "Light Mode"}</span></div><div className="tog" style={{ ...s.tog, background: dk ? "#4cd964" : "rgba(0,0,0,.15)" }} onClick={() => setDk(!dk)}><div style={{ ...s.togK, transform: dk ? "translateX(18px)" : "translateX(0)" }} /></div></div>
              <div style={{ height: 1, background: C.divider, marginLeft: 16 }} />
              <div style={{ padding: "14px 16px" }}><div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, color: C.text }}><PaletteI /><span style={{ fontSize: 15, fontWeight: 550 }}>Theme</span></div><div style={{ display: "flex", gap: 8 }}>{THEMES.map(t => {
                const isSel = themeId === t.id;
                return <div key={t.id} className="thm" style={{ flex: 1, borderRadius: t.cardRadius > 12 ? 16 : 8, overflow: "hidden", border: isSel ? `2.5px solid ${dk ? t.checkColor : t.accentColor}` : `2px solid ${dk ? "rgba(255,255,255,.1)" : "rgba(0,0,0,.08)"}`, cursor: "pointer", background: t.preview.bg1 }} onClick={() => setThemeId(t.id)}>
                  {/* Mini card preview */}
                  <div style={{ padding: "8px 6px 4px" }}>
                    <div style={{ height: 4, width: "60%", borderRadius: t.cardRadius > 12 ? 3 : 1, background: t.preview.fg, marginBottom: 3, opacity: .7 }} />
                    <div style={{ height: 3, width: "90%", borderRadius: 2, background: t.preview.fg, opacity: .15, marginBottom: 2 }} />
                    <div style={{ height: 3, width: "70%", borderRadius: 2, background: t.preview.fg, opacity: .1 }} />
                  </div>
                  <div style={{ padding: "2px 6px", display: "flex", gap: 3 }}>
                    <div style={{ flex: 1, height: 16, borderRadius: t.cardRadius > 12 ? 6 : 2, background: t.preview.bg2 }} />
                    <div style={{ flex: 1, height: 16, borderRadius: t.cardRadius > 12 ? 6 : 2, background: t.preview.bg2 }} />
                  </div>
                  <div style={{ textAlign: "center", padding: "5px 4px 7px" }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: t.preview.fg, fontFamily: t.headFont, opacity: .8 }}>{t.name}</span>
                    {isSel && <div style={{ margin: "2px auto 0", width: 14, height: 14, borderRadius: 7, background: dk ? t.checkColor : t.accentColor, display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></div>}
                  </div>
                </div>;
              })}</div></div>
              {/* ── Account & Storage ── */}
              <div style={{ padding: "14px 16px", borderTop: `1px solid ${C.divider}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  {user?.photoURL ? (
                    <img src={user.photoURL} style={{ width: 36, height: 36, borderRadius: 18, border: `2px solid ${C.divider}` }} referrerPolicy="no-referrer" />
                  ) : (
                    <div style={{ width: 36, height: 36, borderRadius: 18, background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 15, fontWeight: 700 }}>{(user?.displayName || "U")[0]}</div>
                  )}
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{user?.displayName || "User"}</p>
                    <p style={{ fontSize: 11, color: C.soft }}>{user?.email}</p>
                  </div>
                  <span style={{ fontSize: 10, color: saveStatus === "saving" ? C.soft : saveStatus === "error" ? "#ff3b30" : C.check, fontWeight: 600 }}>{saveStatus === "saving" ? "⟳ Saving…" : saveStatus === "error" ? "⚠ Local only" : "✓ Synced"}</span>
                </div>
                <p style={{ fontSize: 12, color: C.soft, lineHeight: 1.5, marginBottom: 12 }}>{notes.length} notes · {folders.length} projects · Auto-saved to cloud</p>
                <div className="sr" onClick={() => { if (confirm("Reset all data? This will restore the sample notes and delete everything.")) { setNotes(SAMPLE_NOTES); setFolders(DEFAULT_FOLDERS); setDk(false); setThemeId("minimal"); } }} style={{ padding: "10px 14px", borderRadius: 12, background: dk ? "rgba(255,59,48,.1)" : "rgba(255,59,48,.06)", cursor: "pointer", textAlign: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#ff3b30" }}>Reset to sample data</span>
                </div>
                <div className="sr" onClick={onSignOut} style={{ padding: "10px 14px", borderRadius: 12, background: dk ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.03)", cursor: "pointer", textAlign: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.soft }}>Sign out</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ══ LIST ══ */}
        {view === "list" && (
          <div style={{ ...s.vc, height: "100%", maxWidth: isDesktop ? 600 : "none", margin: isDesktop ? "0 auto" : 0, width: "100%" }} className="vi">
            <div style={{ ...s.tBar, paddingTop: isDesktop ? 16 : 48 }}><div className="tb" style={{ ...s.tIc, color: C.text }} onClick={() => setSideOpen(true)}><Hamburger /></div><h1 style={{ ...s.tTitle, color: C.text, fontFamily: T.headFont, fontWeight: T.headWeight, letterSpacing: T.headSpacing, fontSize: T.id === "diary" ? 36 : 32 }}>{hLabel}</h1><div className="tb" style={{ ...s.tIc, color: C.text }} onClick={() => setSetOpen(true)}><Gear /></div></div>
            {saveStatus && <div style={{ textAlign: "center", padding: "2px 0 6px", transition: "opacity .3s" }}><span style={{ fontSize: 12, color: saveStatus === "saving" ? C.soft : saveStatus === "error" ? "#ff3b30" : C.check, fontWeight: 600, letterSpacing: .5 }}>{saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "⚠ " + (saveError || "Save failed") : "✓ Saved to cloud"}</span></div>}
            {curF && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "0 24px 2px" }}><div style={{ width: 8, height: 8, borderRadius: 4, background: curF.color }} /><span style={{ fontSize: 13, color: curF.color, fontWeight: 600 }}>{cntFor(activeF)} note{cntFor(activeF) !== 1 ? "s" : ""}</span></div>}
            <div style={s.sW}><div style={{ ...s.sB, background: C.searchBg, borderRadius: T.searchRadius, border: T.cardStyle === "solid" ? `1px solid ${dk ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)"}` : "none" }} onClick={() => setSearchOn(true)}><span style={{ color: C.soft }}><SearchI /></span>{searchOn ? <input ref={searchRef} className="si" style={{ ...s.si, color: C.text, fontFamily: T.uiFont }} value={searchQ} onChange={e => setSearchQ(e.target.value)} onBlur={() => { if (!searchQ) setSearchOn(false); }} placeholder="Search" /> : <span style={{ fontSize: 16, color: C.muted, fontFamily: T.uiFont }}>Search</span>}{searchQ && <div style={s.clr} onClick={e => { e.stopPropagation(); setSearchQ(""); setSearchOn(false); }}>✕</div>}</div></div>
            <StackedCardList
              notes={filtered}
              pinned={pinned}
              unpinned={unpinned}
              folders={folders}
              activeF={activeF}
              dk={dk}
              theme={T}
              C={C}
              onOpen={openNote}
              onDelete={delNote}
              onAssignFolder={assignFSw}
              onPickFolder={nid => setPickingNote(nid)}
              searchQ={searchQ}
            />
            <div className={"fab safe-fab"} style={{ ...s.fab, background: C.fabBg, color: C.fabC, borderRadius: T.fabRadius }} onClick={createNote}><PlusI /></div>
          </div>
        )}

        {/* ══ EDITOR ══ */}
        {view === "editor" && selId && (
          <div className={animIn ? "ei" : "eo"} style={{ ...s.ed, top: 0, background: dk ? "#1c1c1e" : (T.cardStyle === "glass" ? (selNote ? PALETTES[selNote.color].bg : PALETTES[0].bg) : T.cardStyle === "paper" ? "#fffdf7" : T.phoneBg), maxWidth: isDesktop ? 700 : "none", margin: isDesktop ? "0 auto" : 0, left: isDesktop ? 0 : 0, right: isDesktop ? 0 : 0 }}>
            {/* Top bar */}
            <div style={{ ...s.eBar, paddingTop: isDesktop ? 12 : 52 }}>
              <div className="tb" style={{ ...s.bk, color: C.text }} onClick={closeNote}><BackI /><span style={{ fontSize: 17, fontWeight: 500 }}>Back</span></div>
              <div style={{ display: "flex", gap: 2 }}>
                <div className="tb" style={{ ...s.ti, color: C.text }} onClick={() => { setShowFP(!showFP); setShowCP(false); }}><TagI /></div>
                <div className="tb" style={{ ...s.ti, color: C.text }} onClick={() => { setShowCP(!showCP); setShowFP(false); }}><ColorI /></div>
                <div className="tb" style={{ ...s.ti, color: C.text }} onClick={togPin}><PinI filled={selNote?.pinned} /></div>
                <div className="tb" style={{ ...s.ti, color: C.text }} onClick={delSel}><TrashI /></div>
              </div>
            </div>

            {showFP && <div style={s.pkR} className="pk">{[{ id: null, name: "None", icon: "", color: "" }, ...folders].map(f => <div key={f.id || "x"} className="ch" style={{ ...s.ch, background: selNote?.folderId === f.id ? (f.color ? f.color + "22" : dk ? "rgba(255,255,255,.15)" : "rgba(0,0,0,.1)") : dk ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.04)", color: selNote?.folderId === f.id && f.color ? f.color : C.soft, fontWeight: selNote?.folderId === f.id ? 600 : 400, borderColor: selNote?.folderId === f.id && f.color ? f.color + "44" : "transparent" }} onClick={() => assignFEd(f.id)}>{f.icon && <span style={{ fontSize: 11 }}>{f.icon}</span>} {f.name}</div>)}</div>}
            {showCP && <div style={s.cR} className="pk">{PALETTES.map((p, i) => <div key={i} className="cd" style={{ ...s.cD, background: p.bg.replace(/[\d.]+\)$/, "1)"), border: selNote?.color === i ? `2.5px solid ${p.accent}` : `2.5px solid ${dk ? "rgba(255,255,255,.12)" : "rgba(0,0,0,.08)"}` }} onClick={() => setCol(i)}>{selNote?.color === i && <div style={{ color: p.accent, fontSize: 11, fontWeight: 700 }}>✓</div>}</div>)}</div>}

            {selNote?.folderId && (() => { const f = folders.find(x => x.id === selNote.folderId); return f ? <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12, fontWeight: 500, padding: "2px 0 2px" }}><div style={{ width: 6, height: 6, borderRadius: 3, background: f.color }} /><span style={{ color: f.color, fontWeight: 600 }}>{f.name}</span></div> : null; })()}
            <div style={{ textAlign: "center", fontSize: 12, color: C.muted, padding: "2px 24px 8px", fontWeight: 500 }}>{selNote && fmtFull(selNote.date)}</div>

            {/* Content */}
            <div className={T.id === "diary" && !dk ? "paper-lines" : ""} style={{ ...s.eC, fontFamily: T.bodyFont }}>
              <input ref={titleRef} style={{ ...s.eT, color: C.text, fontFamily: T.headFont, fontWeight: T.headWeight, letterSpacing: T.headSpacing, fontSize: T.id === "diary" ? 36 : 30 }} value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Title" />

              {/* Blocks */}
              {editBlocks.map((block, bi) => {
                const isLastText = block.type === "text" && bi === editBlocks.length - 1;
                return (
                  <div key={block.id} style={{ marginBottom: block.type === "text" ? 2 : 14, position: "relative" }}>
                    {block.type === "text" && <TextBlock block={block} onChange={updateBlock} dk={dk} blockRef={isLastText ? lastTextRef : undefined} themeId={T.id} />}
                    {block.type === "todo" && <TodoBlock block={block} onChange={updateBlock} dk={dk} focusItemId={block._focusId} />}
                    {block.type === "table" && <TableBlock block={block} onChange={updateBlock} dk={dk} />}
                    {block.type === "file" && <FileBlock block={block} onRemove={removeBlock} dk={dk} onPreview={setPreviewFile} />}
                  </div>
                );
              })}
              <div style={{ flex: 1, minHeight: 120, cursor: "text" }} onClick={() => {
                if (lastTextRef.current) { lastTextRef.current.focus(); const sel = window.getSelection(); sel.selectAllChildren(lastTextRef.current); sel.collapseToEnd(); }
              }} />
            </div>

            {/* ── Bottom toolbar ── */}
            <div className={"safe-b"} style={{ ...s.toolbar, background: dk ? "rgba(44,44,46,.95)" : (T.cardStyle === "glass" ? "rgba(255,255,255,.92)" : T.cardStyle === "paper" ? "#fef9f0" : T.phoneBg), borderTop: `1px ${T.cardStyle === "paper" ? "dashed rgba(160,140,110,.2)" : "solid"} ${T.cardStyle === "paper" ? "" : C.divider}`, backdropFilter: T.cardStyle === "glass" ? "blur(20px)" : "none" }}>
              <div className="tbb" style={{ ...s.tbb, color: C.text }} onMouseDown={e => { e.preventDefault(); doFormat("underline"); }} title="Underline"><UnderlineI /><span style={{ ...s.tbLbl, fontSize: T.id === "diary" ? 12 : 9 }}>Underline</span></div>
              <div className="tbb" style={{ ...s.tbb, color: "#e8a449" }} onMouseDown={e => { e.preventDefault(); doFormat("highlight"); }} title="Highlight"><HighlightI /><span style={{ ...s.tbLbl, fontSize: T.id === "diary" ? 12 : 9 }}>Highlight</span></div>
              <div className="tbb" style={{ ...s.tbb, color: T.id === "diary" ? "#7a6a5a" : "#34c759" }} onClick={addTodoBlock} title="To-Do"><TodoI /><span style={{ ...s.tbLbl, fontSize: T.id === "diary" ? 12 : 9 }}>To-Do</span></div>
              <div className="tbb" style={{ ...s.tbb, color: T.id === "diary" ? "#8c7e6d" : "#4a7dbd" }} onClick={addTableBlock} title="Table"><TableI /><span style={{ ...s.tbLbl, fontSize: T.id === "diary" ? 12 : 9 }}>Table</span></div>
              <div className="tbb" style={{ ...s.tbb, color: T.id === "diary" ? "#9c8b78" : "#9b59b6" }} onClick={addFileBlock} title="File"><FileI /><span style={{ ...s.tbLbl, fontSize: T.id === "diary" ? 12 : 9 }}>File</span></div>
            </div>
          </div>
        )}

        {/* FOLDER PICKER BOTTOM SHEET */}
        {pickingNote && <>
          <div onClick={() => setPickingNote(null)} style={{ position: "absolute", inset: 0, zIndex: 400, borderRadius: R, background: C.overlay, animation: "vf .2s ease both" }} />
          <div style={{
            position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 410,
            background: C.panelBg, borderRadius: `${Math.max(T.cardRadius, 16)}px ${Math.max(T.cardRadius, 16)}px ${R}px ${R}px`,
            padding: "8px 0 40px", maxHeight: "60%", display: "flex", flexDirection: "column",
            animation: "bsUp .3s cubic-bezier(.23,1,.32,1) both",
            boxShadow: "0 -10px 40px rgba(0,0,0,.12)",
          }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: dk ? "rgba(255,255,255,.15)" : "rgba(0,0,0,.12)", margin: "4px auto 12px" }} />
            <div style={{ padding: "0 20px 8px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <h3 style={{ fontSize: T.id === "diary" ? 24 : 18, fontWeight: T.headWeight, color: C.text, letterSpacing: T.headSpacing, fontFamily: T.headFont }}>Move to project</h3>
              <div className="tb" style={{ width: 32, height: 32, borderRadius: 16, color: C.soft }} onClick={() => setPickingNote(null)}><XI /></div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "4px 16px" }}>
              {/* None option */}
              {(() => { const sel = notes.find(n => n.id === pickingNote)?.folderId === null; return (
                <div className="sr" onClick={() => { assignFSw(pickingNote, null); setPickingNote(null); }}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, marginBottom: 2, background: sel ? C.active : "transparent", cursor: "pointer" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: dk ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.05)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 14, color: C.soft }}>○</span>
                  </div>
                  <span style={{ fontSize: 15, fontWeight: sel ? 650 : 500, color: C.text }}>None</span>
                  {sel && <div style={{ marginLeft: "auto", color: dk ? "#4cd964" : "#34c759" }}><CheckI /></div>}
                </div>
              ); })()}
              {/* Folders */}
              {folders.map(fl => { const sel = notes.find(n => n.id === pickingNote)?.folderId === fl.id; return (
                <div key={fl.id} className="sr" onClick={() => { assignFSw(pickingNote, fl.id); setPickingNote(null); }}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, marginBottom: 2, background: sel ? C.active : "transparent", cursor: "pointer" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: fl.color + "18", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 15, color: fl.color }}>{fl.icon}</span>
                  </div>
                  <span style={{ fontSize: 15, fontWeight: sel ? 650 : 500, color: C.text }}>{fl.name}</span>
                  <span style={{ fontSize: 12, color: C.soft, marginLeft: "auto", marginRight: sel ? 8 : 0 }}>{cntFor(fl.id)}</span>
                  {sel && <div style={{ color: fl.color }}><CheckI /></div>}
                </div>
              ); })}
            </div>
          </div>
        </>}

        {/* FILE PREVIEW */}
        {previewFile && <FilePreviewModal block={previewFile} dk={dk} onClose={() => setPreviewFile(null)} borderR={R} isDesktop={true} />}

      </div>
  );

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", fontFamily: T.uiFont, position: "relative" }}>
      <style>{buildCSS(dk, theme)}</style>
      <input type="file" ref={fileRef} style={{ display: "none" }} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.mp3,.mp4" onChange={handleFileChange} />
      {appContent}
    </div>
  );
}

/* ── CSS ── */
const buildCSS = (dk, theme) => `
@import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,300;0,8..60,400;0,8..60,600;1,8..60,300;1,8..60,400&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;0,700;1,400&display=swap');
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@400;500;600;700&display=swap');
.paper-lines{background-image:repeating-linear-gradient(transparent,transparent 31px,rgba(160,140,110,.13) 31px,rgba(160,140,110,.13) 32px);background-position:0 0}
.paper-margin{border-left:2px solid rgba(220,100,100,.12);margin-left:0;padding-left:14px}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}::-webkit-scrollbar{width:0;height:0}
@keyframes fu{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes si{from{opacity:0;transform:translateX(50px)}to{opacity:1;transform:translateX(0)}}
@keyframes so{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(50px)}}
@keyframes sp{0%,100%{opacity:.4}50%{opacity:.7}}
@keyframes ps{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
@keyframes bsUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes vf{from{opacity:0}to{opacity:1}}
@keyframes spin{to{transform:rotate(360deg)}}
.vi{animation:vf .3s ease both}.ov{animation:vf .25s ease both}.pk{animation:ps .25s cubic-bezier(.23,1,.32,1) both}
.ei{animation:si .4s cubic-bezier(.23,1,.32,1) both}.eo{animation:so .3s cubic-bezier(.23,1,.32,1) both}
.tb{transition:all .2s ease;cursor:pointer;display:flex;align-items:center;justify-content:center}
.tb:hover{background:${dk?"rgba(255,255,255,.08)":"rgba(0,0,0,.06)"};transform:scale(1.05)}.tb:active{transform:scale(.92)}
.cd{transition:all .2s cubic-bezier(.23,1,.32,1);cursor:pointer}.cd:hover{transform:scale(1.25)}
.ch{transition:all .2s ease;cursor:pointer}.ch:hover{transform:scale(1.04)}.ch:active{transform:scale(.96)}
.fab{transition:all .25s cubic-bezier(.23,1,.32,1)}.fab:hover{transform:scale(1.08);box-shadow:0 8px 32px rgba(0,0,0,.25)}.fab:active{transform:scale(.94)}
@supports(padding:env(safe-area-inset-bottom)){.safe-b{padding-bottom:env(safe-area-inset-bottom)}.safe-fab{bottom:calc(32px + env(safe-area-inset-bottom)) !important}}
.sr{transition:all .2s ease;cursor:pointer}.sr:hover{background:${dk?"rgba(255,255,255,.06)":"rgba(0,0,0,.04)"} !important}.sr:active{transform:scale(.98)}
.tog{cursor:pointer;transition:background .3s ease}
.thm{transition:all .2s ease;cursor:pointer}.thm:hover{transform:scale(1.05)}
.tbb{transition:all .15s ease;cursor:pointer}.tbb:hover{background:${dk?"rgba(255,255,255,.08)":"rgba(0,0,0,.05)"}}.tbb:active{transform:scale(.9)}
.si::placeholder{color:${dk?"rgba(255,255,255,.3)":"rgba(0,0,0,.32)"}}
textarea::placeholder,input::placeholder{color:${dk?"rgba(255,255,255,.25)":"rgba(0,0,0,.28)"}}textarea:focus,input:focus{outline:none}
[contenteditable]:empty:before{content:attr(data-placeholder);color:${dk?"rgba(255,255,255,.25)":"rgba(0,0,0,.25)"};pointer-events:none}
[contenteditable] mark{background:${theme?.id==="diary"?"rgba(180,160,100,.25)":theme?.id==="editorial"?"rgba(200,180,100,.3)":"#ffe066"};color:inherit;border-radius:3px;padding:0 2px}
[contenteditable] u{text-decoration-color:${dk?"rgba(255,255,255,.5)":"rgba(0,0,0,.4)"}}
`;

/* ── Styles ── */
const s = {
  root: { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'SF Pro Display',-apple-system,BlinkMacSystemFont,sans-serif", position: "relative", overflow: "hidden", padding: "40px 20px", transition: "background .5s" },
  orb1: { position: "fixed", top: "-20%", left: "-10%", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle,rgba(255,200,150,.12) 0%,transparent 70%)", animation: "sp 8s ease-in-out infinite", pointerEvents: "none" },
  orb2: { position: "fixed", bottom: "-15%", right: "-10%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle,rgba(150,180,255,.1) 0%,transparent 70%)", animation: "sp 10s ease-in-out infinite 2s", pointerEvents: "none" },
  orb3: { position: "fixed", top: "40%", right: "20%", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle,rgba(200,150,255,.07) 0%,transparent 70%)", animation: "sp 12s ease-in-out infinite 4s", pointerEvents: "none" },
  phone: { width: 393, height: 852, borderRadius: 55, background: "#000", padding: 4, boxShadow: "0 50px 100px rgba(0,0,0,.15),0 20px 40px rgba(0,0,0,.1)", position: "relative", zIndex: 1 },
  inner: { width: "100%", height: "100%", borderRadius: 51, overflow: "hidden", position: "relative", transition: "background .5s" },
  stat: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 28px 0", height: 54, zIndex: 200, position: "relative" },
  time: { fontSize: 16, fontWeight: 700, letterSpacing: .3 }, icons: { display: "flex", alignItems: "center", gap: 6 },
  bars: { display: "flex", alignItems: "flex-end", gap: 1.5 },
  batt: { width: 25, height: 12, borderRadius: 3.5, border: "1.5px solid", position: "relative", display: "flex", alignItems: "center", padding: 1.5 },
  vc: { height: "calc(100% - 54px)", display: "flex", flexDirection: "column", position: "relative" },
  tBar: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px 4px" },
  tIc: { width: 42, height: 42, borderRadius: 14 },
  tTitle: { fontSize: 32, fontWeight: 700, letterSpacing: -.8, fontFamily: "'Source Serif 4',Georgia,serif", textAlign: "center", flex: 1 },
  sW: { padding: "8px 18px 4px" },
  sB: { display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 14, cursor: "text" },
  si: { flex: 1, border: "none", background: "transparent", fontSize: 17, fontFamily: "inherit" },
  clr: { width: 20, height: 20, borderRadius: 10, background: "rgba(120,120,120,.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff", fontWeight: 700, cursor: "pointer" },
  scr: { flex: 1, overflowY: "auto", padding: "4px 24px" },
  secL: { fontSize: 12, fontWeight: 650, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6 },
  emp: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 80 },
  fab: { position: "absolute", bottom: 32, right: 22, width: 60, height: 60, borderRadius: 30, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 24px rgba(0,0,0,.2)", cursor: "pointer", zIndex: 250 },
  ov: { position: "absolute", inset: 0, zIndex: 300, borderRadius: 51 },
  side: { position: "absolute", top: 0, left: 0, bottom: 0, width: "82%", zIndex: 310, borderRadius: "51px 0 0 51px", display: "flex", flexDirection: "column", transition: "transform .35s cubic-bezier(.23,1,.32,1),background .4s", boxShadow: "4px 0 30px rgba(0,0,0,.1)" },
  sett: { position: "absolute", top: 0, right: 0, bottom: 0, width: "85%", zIndex: 310, borderRadius: "0 51px 51px 0", display: "flex", flexDirection: "column", transition: "transform .35s cubic-bezier(.23,1,.32,1),background .4s", boxShadow: "-4px 0 30px rgba(0,0,0,.1)" },
  pH: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "68px 24px 16px" },
  pT: { fontSize: 26, fontWeight: 700, letterSpacing: -.6, fontFamily: "'Source Serif 4',Georgia,serif" },
  xB: { width: 36, height: 36, borderRadius: 18 },
  pS: { flex: 1, overflowY: "auto", padding: "4px 16px 24px" },
  sr: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", borderRadius: 14, marginBottom: 2 },
  srL: { display: "flex", alignItems: "center", gap: 12 },
  srD: { width: 34, height: 34, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" },
  srN: { fontSize: 15, letterSpacing: -.1, fontWeight: 500 },
  srC: { fontSize: 14, fontWeight: 500 },
  nfI: { border: "none", background: "transparent", fontSize: 15, fontWeight: 500, fontFamily: "inherit", flex: 1 },
  sL: { fontSize: 12, fontWeight: 650, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, paddingLeft: 4 },
  sC: { borderRadius: 16, overflow: "hidden" },
  tog: { width: 48, height: 30, borderRadius: 15, padding: 3 },
  togK: { width: 24, height: 24, borderRadius: 12, background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,.15)", transition: "transform .3s cubic-bezier(.23,1,.32,1)" },
  ed: { position: "absolute", top: 54, bottom: 0, left: 0, right: 0, display: "flex", flexDirection: "column", zIndex: 50 },
  eBar: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px 6px" },
  bk: { display: "flex", alignItems: "center", gap: 4, padding: "10px 14px 10px 8px", borderRadius: 12, background: "transparent" },
  ti: { width: 40, height: 40, borderRadius: 12, background: "transparent" },
  pkR: { display: "flex", flexWrap: "wrap", gap: 8, padding: "6px 20px 10px", justifyContent: "center" },
  ch: { padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 5, border: "1.5px solid transparent" },
  cR: { display: "flex", justifyContent: "center", gap: 12, padding: "8px 24px 10px" },
  cD: { width: 32, height: 32, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center" },
  eC: { flex: 1, padding: "0 20px 0", overflowY: "auto", display: "flex", flexDirection: "column" },
  eT: { fontSize: 32, fontWeight: 700, border: "none", background: "transparent", fontFamily: "'Source Serif 4',Georgia,serif", letterSpacing: -.8, lineHeight: 1.2, marginBottom: 14, width: "100%" },
  /* Toolbar */
  toolbar: { display: "flex", justifyContent: "space-around", padding: "8px 8px", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", flexShrink: 0 },
  tbb: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "6px 8px", borderRadius: 10, minWidth: 52 },
  tbLbl: { fontSize: 9, fontWeight: 600, letterSpacing: .2, opacity: .7 },
  sig: { marginTop: 32, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", fontWeight: 500, zIndex: 1 },
};
