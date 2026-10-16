# SpaceKeeper for ChromeOS: set-up for administrators

SpaceKeeper controls ChromeOS desks through Google's **Desk API**. ChromeOS only lets a web page use it when an administrator switches it on in the Google Admin console and allows that page's web address. Without this, SpaceKeeper opens in **demo mode** with pretend desks.

This works only on **managed** Chromebooks (enrolled in your school's or organisation's Google Admin console), with users signed in to managed accounts.

## 1. Decide where SpaceKeeper is hosted

SpaceKeeper is a set of static files with no server code. You can:

- **Use the public copy** at `https://shuistyle.github.io/SpaceKeeper-ChromeOS/`, or
- **Host your own copy (recommended for schools)** on a web address your organisation controls, for example `https://apps.yourschool.org.uk/spacekeeper/`. Any static web host works (Google Sites won't, but Firebase Hosting, GitHub Pages under your own account, or your own web server will). Copy every file in this folder, keeping the folder structure.

**Why your own copy is safer:** allowing a web address lets every page on that site control desks. Allowing `https://shuistyle.github.io` would cover every page published from that GitHub account, not just SpaceKeeper. Allowing your own address keeps that decision in your hands, and updates arrive only when you copy them.

## 2. Switch on the Desk API

1. Sign in to the [Google Admin console](https://admin.google.com).
2. Go to **Menu › Devices › Chrome › Settings › Users & browsers**.
3. Select the organisational unit for the people who'll use SpaceKeeper (a small pilot group is a good start).
4. Find the **Desk API** settings and set:
   - **Enable Desk API for third-party ChromeOS desk control** → *Enabled*. (Policy `DeskAPIThirdPartyAccessEnabled` = `true`.)
   - **Enable Desk API for a list of third-party domain** → add the address SpaceKeeper is hosted at, for example `https://apps.yourschool.org.uk`. (Policy `DeskAPIThirdPartyAllowlist`.)
5. Click **Save**. People need to sign out and back in (or restart) for the change to take effect.

Google's own description of these settings: [Desk Connector documentation](https://github.com/chromeos/desk-connector) and the [Desk API codelab](https://codelabs.developers.google.com/deskapi). If the Admin console wording differs from the above, follow Google's current wording; the policy names are what matter.

## 3. Check it worked

On a Chromebook in that organisational unit:

1. Open `chrome://policy`, click **Reload policies**, and check that both policies above show status **OK** with the values you set.
2. Open SpaceKeeper's address. The "Demo mode" message should be gone, and the tile for the desk you're on should show its ChromeOS name.

If it still says demo mode, the message underneath says what's missing.

## 4. Install it for people (optional)

SpaceKeeper is an installable web app. Either:

- people open its address in Chrome and choose **Install SpaceKeeper** (the install icon in the address bar, or **⋮ › Cast, save and share › Install page as app**), or
- in the Admin console, go to **Menu › Chrome browser › Apps & extensions › Users & browsers**, add it **by URL** as a web app, and choose **Force install** and **Pin to shelf**.

## What SpaceKeeper can and can't do with this access

It can: see which desk is in use and each desk's ChromeOS name, go to a desk, add a desk, remove a desk, and keep its own window visible on every desk.

When it removes a desk, the windows on that desk **move to the next desk**. SpaceKeeper never closes anyone's windows, and by default it asks before removing.

It can't: see what's in any window or tab, read typing, or reach any other device or service. It has no server and sends nothing anywhere. Names and colours stay in that person's browser on that Chromebook (local storage).

## Versions

ChromeOS 108 or later. Live updates when someone changes desk need ChromeOS 116 or later; on older versions SpaceKeeper catches up every couple of seconds instead.
