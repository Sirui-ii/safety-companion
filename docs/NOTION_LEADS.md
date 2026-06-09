# Lulu Notion Leads

Use this setup when the landing page should collect hackathon leads before showing Lulu's number.

## Database Schema

Create a Notion database named `Lulu Leads` with these properties:

```text
Name: title
First Name: text
Last Name: text
Phone: phone
Email: email
SMS Opt In: checkbox
Email Opt In: checkbox
Source: text
Session ID: text
Created At: date
```

## Integration Setup

1. Create a Notion internal integration.
2. Copy the integration secret into Vercel as `NOTION_API_KEY`.
3. Share the `Lulu Leads` database with that integration.
4. Copy the database ID into Vercel as `NOTION_LEADS_DATABASE_ID`.
5. Redeploy the Vercel app.

## Data Policy

The form collects name, phone, and email only before showing Lulu's phone number. SMS and email marketing consent are separate checkboxes. Calls are not recorded, and conversation content is not stored by this form.
