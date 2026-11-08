# Team Dexter HQ 🏡

Our household app for iPhone (it also works on Android, an iPad or a computer). One home screen with five menus:

- **🍽️ Meals**: the fortnight's meal plan, recipes, swaps, the cheapest one-store shop and a trolley checklist
- **🧽 Cleaning**: a weekly routine with short jobs for work-from-home breaks and the big clean on the weekend
- **💰 Budgeting**: a quick "left until payday" view, with the full budget a tap away
- **🎁 Wishlist**: wishes with prices, and how much to put away each pay
- **📅 Calendar**: shared events and reminders

Once sharing is switched on (section 3), anything one of you changes appears on the other's phone within a second or two.

---

## 1. Put it on GitHub (about 5 minutes, one time)

1. Sign in at **github.com**, or create a free account.
2. Click **+** (top right), then **New repository**. Name it `family-feast`, choose **Public** (free hosting needs a public repository), and click **Create repository**.
3. Click **uploading an existing file**.
4. Unzip `team-dexter-hq.zip`. Open the folder, select **everything inside it**, and drag it onto the page. Use Chrome or Safari on a computer so the `css`, `data`, `icons` and `js` folders upload as folders.
5. Click **Commit changes**.
6. Go to **Settings**, then **Pages**. Set **Source** to **Deploy from a branch**, choose branch **main** and folder **/ (root)**, then click **Save**.
7. A minute or two later the page shows your address, something like **`https://YOUR-USERNAME.github.io/family-feast/`**.

If you already uploaded the old Family Feast app, upload these files over the top of it the same way.

## 2. Install it on your iPhone

1. Open the address in **Safari**.
2. Tap **Share** (the square with an up arrow), then **Add to Home Screen**, then **Add**.
3. Open it from the home screen. When it asks who the phone is for, tap **I'm Jacob**.

## 3. Turn on live sharing with Sienna (about 5 minutes, one time)

The app uses a free Firebase database from Google so both phones see the same data.

1. On a computer, go to **console.firebase.google.com** and sign in with a Google account.
2. Click **Create a project**. Name it `team-dexter`, turn Google Analytics **off**, and create it.
3. In the left menu, open **Build**, then **Realtime Database**, then **Create database**. Choose **Singapore (asia-southeast1)**, the closest location to Adelaide, then **Start in locked mode**, then **Enable**.
4. Open the **Rules** tab, replace everything there with the following, and click **Publish**:

   ```json
   {
     "rules": {
       ".read": false,
       ".write": false,
       "households": {
         "$household": {
           ".read": "$household.length >= 20",
           ".write": "$household.length >= 20"
         }
       }
     }
   }
   ```

5. Open the **Data** tab and copy the address at the top. It looks like `https://team-dexter-default-rtdb.asia-southeast1.firebasedatabase.app`.
6. In the app on your phone, tap the **"On this phone only"** pill (top of the home screen). Paste the address and tap **Connect**. The pill turns green.
7. Tap the green pill again, then **Copy invite link** (or **Share…**), and text the link to Sienna.
8. Sienna opens the link in **Safari** on her iPhone, then adds the app to her home screen from that page (Share, then Add to Home Screen) and taps **I'm Sienna**. Her phone is now joined to the household.

Firebase's free plan is much larger than this app will ever need.

**Keep the invite link between the two of you.** Anyone who has it can see and change the household's data.

## 4. Import the budget (one time)

The budget numbers are **not** in the GitHub files, because the repository is public. They go straight from your phone into your private household database instead:

1. Save `budget-seed.json` (sent separately, not in the zip) to your iPhone's Files app.
2. Open **Budget**, tap **Import**, choose the file, check the preview, and confirm.

Sienna's phone gets the budget automatically. Later you can import a newer bank export from **Full budget → Plan & data**. Nothing is counted twice.

## Good to know

- **Offline:** the app works without internet. Changes made offline sync next time you're connected.
- **Reminders:** iPhones don't let home-screen web apps send alerts. To be reminded about a calendar event, open it and tap **Add to iPhone Calendar**.
- **No sound?** The iPhone silent switch mutes the app. The 🎵 and 🔔 buttons in Meals turn the music and sounds off.
- **Updating:** upload new files over the old ones on GitHub. The app updates the next time it's opened with internet. If it looks out of date, swipe it closed and open it again.
- **Each new fortnight of meals:** ask Claude for a new plan, then upload the three new files in `data/`.

## What's inside

| File | What it does |
|---|---|
| `index.html` | The screens, and the styling for the Meals menu |
| `js/hub.js`, `css/hub.css` | The home menu, moving between menus, and shared styles |
| `js/store.js` | Saves everything on the phone and syncs it live through Firebase |
| `js/mod-*.js`, `css/mod-*.css` | The Cleaning, Budget, Wishlist and Calendar menus |
| `js/app.js`, `js/draw*.js`, `js/persist.js`, `js/shim.js`, `data/` | The Meals menu |
| `js/audio.js` | Lofi music and soft sounds, made live in the browser |
| `sw.js`, `manifest.webmanifest`, `icons/` | Make it installable and let it work offline |
| `MODULES.md` | Notes for whoever builds the next menu |
