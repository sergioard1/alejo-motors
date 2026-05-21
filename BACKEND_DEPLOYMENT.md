# Alejo Motors Backend

This site is ready to run as a real Node backend for:

- owner login
- adding vehicles
- removing vehicles
- saving inventory persistently in GitHub
- receiving lead forms
- sending lead emails through SendGrid
- sending lead text messages through Twilio

## Required private environment variables

Do not commit real values for these variables.

```text
ADMIN_EMAIL=alejomotorstx@gmail.com
ADMIN_PASSWORD_HASH=<sha256 hash of the owner password>
CONTACT_EMAIL=alejomotorstx@gmail.com
CONTACT_PHONE=+16789271739
GITHUB_REPO=sergioard1/alejo-motors
GITHUB_BRANCH=main
GITHUB_INVENTORY_PATH=data/inventory.json
GITHUB_TOKEN=<GitHub token with contents read/write access>
```

## Optional notification variables

The backend works without these. Add them later in Render when the Twilio and SendGrid accounts are ready.

```text
SENDGRID_API_KEY=<SendGrid API key>
SENDGRID_FROM_EMAIL=<verified SendGrid sender email>
TWILIO_ACCOUNT_SID=<Twilio account SID>
TWILIO_AUTH_TOKEN=<Twilio auth token>
TWILIO_FROM_NUMBER=<Twilio phone number>
```

## Owner login URL

The owner area is hidden from customers. Open it directly with:

```text
https://your-backend-domain/#owner-login
```

## Health check

After deployment, open:

```text
https://your-backend-domain/api/health
```

It will show whether GitHub inventory storage, SendGrid email, and Twilio SMS are configured.
