# NESEA Training Index

Internal web app listing external training courses for NESEA staff. Anyone can
browse and leave a star rating + comment; only admins (PIN-gated) can add,
edit, or remove courses and delete inappropriate reviews.

## 1. Set up Supabase (the database)

1. Create a free project at https://supabase.com.
2. Open **SQL Editor** in your project and run the contents of
   `supabase-setup.sql` (creates the table and locks it down with Row Level
   Security so it cannot be read or written directly from a browser).
3. Go to **Project Settings -> API** and copy:
   - **Project URL** -> this is `SUPABASE_URL`
   - **service_role secret** -> this is `SUPABASE_SERVICE_ROLE_KEY`

The service role key is powerful (it bypasses Row Level Security) and is only
ever read inside server-side API routes (`lib/supabaseClient.js`). It is never
imported into any client component, so it never reaches the browser bundle.

## 2. Set environment variables

Copy `.env.example` to `.env.local` for local testing, and fill in real
values. **Do not commit `.env.local`** — it's already excluded in
`.gitignore`.

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key for reading/writing the courses table |
| `ADMIN_PIN` | The PIN staff type into the "Admin" unlock dialog |
| `ADMIN_TOKEN_SECRET` | Separate secret used to sign admin session tokens — generate with `openssl rand -hex 32` |

When you deploy to Vercel, set these same variables under **Project Settings
-> Environment Variables** instead of uploading the file.

## 3. Run locally (optional, to preview before deploying)

```bash
npm install
npm run dev
```

Visit http://localhost:3000.

## 4. Deploy to Vercel

1. Push this project to a GitHub/GitLab/Bitbucket repo (private repo
   recommended since this is an internal tool).
2. Go to https://vercel.com/new and import the repo.
3. Under **Environment Variables**, add the four variables from the table
   above with your real values.
4. Click **Deploy**. Vercel will build and give you a live URL.
5. Share that URL with KSEA staff. Tell admins the `ADMIN_PIN` separately
   (e.g. in person or a private message), not in a public channel.

Every time you push a new commit, Vercel redeploys automatically.

## How the security works

- **Reading the course list is public** — any staff member with the link can
  browse and search courses without logging in.
- **Adding a review is public but rate-limited** — anyone can submit a
  rating/comment, but the server limits how many submissions one visitor can
  make per minute, and validates the rating (1–5) and field lengths.
- **Adding, editing, or deleting courses, and deleting reviews, requires the
  admin PIN.** The PIN itself never appears in the website's code (unlike a
  PIN hardcoded in the frontend, which anyone could read via browser
  DevTools). Instead:
  1. The browser sends the PIN once to `/api/admin-auth`.
  2. The server checks it against `ADMIN_PIN` (only stored as an environment
     variable, never in code) and, if correct, returns a signed, time-limited
     token (expires after 4 hours).
  3. The browser attaches that token to admin actions. The server verifies
     the signature and expiry on every request before allowing a change.
- **The database itself is locked down** (Row Level Security with no
  policies), so even someone who discovers your Supabase URL cannot read or
  write the table directly — only your Vercel-hosted server can, using the
  service role key.
- **Input is validated and size-capped** on every write (titles, links,
  images, ratings, comment length) to prevent obviously malformed or abusive
  data, and image/link URLs are restricted to `http`/`https` to avoid unsafe
  link types.
- **Basic security headers** (`vercel.json`) reduce clickjacking and MIME-type
  sniffing risks.

## Limitations to know about

- Rate limiting is in-memory per server instance, which is fine for an
  internal tool but resets on redeploys/cold starts. For stronger protection
  against abuse at scale, consider a dedicated service like Upstash
  Ratelimit.
- The PIN is shared among all admins (not individual accounts). If you need
  per-person admin accounts with audit logs later, that would mean adding a
  real authentication provider (e.g. NextAuth with your company's SSO) —
  happy to help with that step if it becomes a priority.
- Anyone with the PIN can edit any course; there's no per-admin permission
  granularity.
