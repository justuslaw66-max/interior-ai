# Prisma Studio Port Binding Fix

## Issue Summary
Prisma Studio was starting (process running) but failing to bind to port 5555, making it inaccessible.

**Root Cause:** Environment variables (specifically `DATABASE_URL`) were not being loaded when running `npx prisma studio`, causing the connection to fail silently.

## Solution Implemented

### What Was Wrong
```bash
# This didn't load .env.local automatically
npx prisma studio --port 5555
# Error: No database URL found
```

### What Works Now
```bash
# Properly preload environment variables with dotenv
node -r dotenv/config ./node_modules/.bin/prisma studio --port 5555
# ✓ Port 5555 now listening
# ✓ Database connected
# ✓ Studio accessible at http://localhost:5555
```

## How to Use

### Option 1: Use npm script (Recommended)
```bash
npm run studio
```
Opens Prisma Studio on http://localhost:5555

### Option 2: Use shell script
```bash
./start-studio.sh
```

### Option 3: Manual command
```bash
node -r dotenv/config ./node_modules/.bin/prisma studio --port 5555
```

## Verification
✅ Port 5555 is now listening (verified via `lsof -i :5555`)
✅ HTTP requests return 200 OK (verified via curl)
✅ Database connection established
✅ Studio accessible in browser at http://localhost:5555

## Files Modified
- `package.json` - Added `"studio"` npm script
- `start-studio.sh` - Created convenient startup script (executable)

## Technical Details

**The Fix:** Using Node's `-r` flag (require) to preload the `dotenv/config` module ensures all environment variables from `.env.local` are available before Prisma Studio starts.

**Why it works:**
1. `dotenv/config` is loaded first via `-r dotenv/config`
2. Environment variables are parsed from `.env.local`
3. `DATABASE_URL` is now available when Prisma Studio initializes
4. Studio can connect to the database and bind to the port
5. The web server starts successfully on port 5555

## Troubleshooting

If Studio still doesn't start:
1. Verify `.env.local` exists and contains `DATABASE_URL`
2. Check that port 5555 isn't already in use: `lsof -i :5555`
3. Kill any existing processes: `pkill -9 -f "prisma studio"`
4. Try the manual command and check for error messages

## Next Steps
You can now:
- Browse database tables visually via Prisma Studio
- Create, update, and delete records
- Explore table relationships
- Test queries interactively
