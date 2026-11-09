# AniFoX Stream API — Stage 1

This branch adds an AniFoX-owned catalog API backed by Supabase and authenticated Cloudflare Stream playback URLs.

## Routes

- GET /api/anime?limit=24 — published anime catalog.
- GET /api/anime-detail?id=<uuid> or ?slug=<slug> — one published anime.
- GET /api/episodes?anime_id=<uuid> — published episode list. The Cloudflare video UID is never returned.
- GET /api/stream?episode_id=<uuid> — requires a valid Supabase access token and returns a short-lived HLS manifest URL.
- Existing /api/anione, /api/muse, and /api/anime-metadata routes are left unchanged.

## 1. Create the database tables

Open the Supabase project dashboard, choose SQL Editor, create a new query, paste the contents of supabase/anifox-stream-schema.sql, and run it.

The schema creates anifox_anime and anifox_episodes. New rows are unpublished by default. Set is_published = true only after the metadata and video have been checked and you have distribution rights for the video.

## 2. Configure Vercel environment variables

Add these in Vercel → Project → Settings → Environment Variables for the Preview environment first:

- SUPABASE_URL — the Supabase project URL.
- SUPABASE_ANON_KEY — the project's publishable/anon key, used only to validate the signed-in user's access token.
- SUPABASE_SERVICE_ROLE_KEY — server-only database access. Never put this in app.js, HTML, or any public variable.
- CLOUDFLARE_ACCOUNT_ID — Cloudflare account ID.
- CLOUDFLARE_STREAM_API_TOKEN — a narrowly scoped API token with permission to create Stream tokens.
- CLOUDFLARE_STREAM_CUSTOMER_CODE — the customer code used in the Stream playback hostname.

Redeploy the Preview deployment after adding variables. Do not paste secret values into GitHub or this documentation.

## 3. Prepare a video

Upload only video that you own or are authorized to distribute. In Cloudflare Stream, enable Require Signed URLs for each video. Store its Cloudflare video UID in the matching anifox_episodes.cloudflare_video_uid row. Keep the episode unpublished until this is complete.

## 4. Add initial records

Use the Supabase Table Editor or SQL Editor to add an anime row and its episode rows. Set is_published to true only when each record is ready to appear in the app.

## 5. Smoke-test the API

- Open /api/anime — should return { "data": [...] }.
- Open /api/anime-detail?slug=<your-slug> — should return one anime.
- Open /api/episodes?anime_id=<anime-uuid> — should return episode metadata and has_stream.
- Call /api/stream?episode_id=<episode-uuid> with an Authorization: Bearer <Supabase access token> header — should return a short-lived HLS URL.

The stream route checks the user's Supabase session and issues a Cloudflare token with a 15-minute expiry. Cloudflare's signed-token API and the Stream customer hostname are documented at https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/.

## Current scope

This stage creates the backend foundation only. It does not upload files, create anime records automatically, or connect the existing frontend player yet. The next stage will connect the episode list and player while preserving the existing watch history and navigation.
