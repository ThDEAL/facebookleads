#!/bin/bash

WEBHOOK_URL="https://facebookleads-beta.vercel.app/api/webhook"
LA_BASE="https://thailandealtours.ladesk.com/api/v3"
LA_KEY="yba9o34norjuvlb8auh2hxcyqwrz4o792s7s8lhr6h"

echo "=============================="
echo "  בדיקת מערכת אוטומציה"
echo "=============================="
echo ""

# Test 1: Webhook verification
echo "1. בדיקת אימות Webhook..."
RESULT=$(curl -s -o /dev/null -w "%{http_code}" "$WEBHOOK_URL?hub.mode=subscribe&hub.verify_token=thailand_webhook_verify&hub.challenge=test123")
if [ "$RESULT" = "200" ]; then
  echo "   ✅ Webhook verification עובד!"
else
  echo "   ❌ Webhook verification נכשל (HTTP $RESULT)"
  echo "   בדוק שה-Environment Variables מוגדרים ב-Vercel"
fi
echo ""

# Test 2: Webhook challenge response
echo "2. בדיקת תשובת Challenge..."
CHALLENGE=$(curl -s "$WEBHOOK_URL?hub.mode=subscribe&hub.verify_token=thailand_webhook_verify&hub.challenge=my_challenge_123")
if [ "$CHALLENGE" = "my_challenge_123" ]; then
  echo "   ✅ Challenge response תקין!"
else
  echo "   ❌ Challenge response: '$CHALLENGE'"
fi
echo ""

# Test 3: Live Agent API
echo "3. בדיקת Live Agent API..."
LA_RESULT=$(curl -s -o /dev/null -w "%{http_code}" -H "apikey: $LA_KEY" "$LA_BASE/agents")
if [ "$LA_RESULT" = "200" ]; then
  echo "   ✅ Live Agent API עובד!"
else
  echo "   ❌ Live Agent API נכשל (HTTP $LA_RESULT)"
fi
echo ""

# Test 4: Simulate a lead form webhook
echo "4. שליחת ליד מדומה (POST)..."
POST_RESULT=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "object": "page",
    "entry": [{
      "id": "123",
      "time": 1234567890,
      "changes": [{
        "field": "leadgen",
        "value": {
          "leadgen_id": "test_lead_123",
          "page_id": "123"
        }
      }]
    }]
  }')
if [ "$POST_RESULT" = "200" ]; then
  echo "   ✅ Webhook מקבל POST (200)!"
  echo "   (הליד המדומה ייכשל בשליפה מפייסבוק - זה צפוי)"
else
  echo "   ❌ Webhook POST נכשל (HTTP $POST_RESULT)"
fi
echo ""

echo "=============================="
echo "  סיום בדיקות"
echo "=============================="
echo ""
echo "אם בדיקות 1-3 עברו, לך ל-Facebook Developers ורשום Webhook:"
echo "  Callback URL: $WEBHOOK_URL"
echo "  Verify Token: thailand_webhook_verify"
