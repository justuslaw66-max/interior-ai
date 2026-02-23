#!/bin/bash

# Start Prisma Studio with proper environment loading
# This fixes the port binding issue by preloading dotenv

echo "Starting Prisma Studio on port 5555..."
echo ""

# Kill any existing Prisma Studio processes
pkill -9 -f "prisma studio" 2>/dev/null || true

# Give it a moment to clean up
sleep 2

# Start Prisma Studio with dotenv preloaded
# This ensures DATABASE_URL and other env vars are available
node -r dotenv/config ./node_modules/.bin/prisma studio --port 5555

echo ""
echo "Prisma Studio is running at http://localhost:5555"
