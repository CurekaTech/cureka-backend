# Listing heading — admin integration

Optional HTML heading for the product-list H1 on brand, category, health concern, and wellness goal. `name` stays the plain label used in admin lists, cards, and navigation.

Base path: `/api/v1`

Auth: admin JWT. Existing create and update permissions for each master.

---

## Field

| Form field | API field | Type | Required |
|------------|-----------|------|----------|
| Product list heading | `listingHeading` | HTML string or `null` | No |

Save the rich-text editor output as HTML, for example `<p><u>Hair Fall</u></p>`.

| Value sent | Stored | Website H1 |
|------------|--------|------------|
| omitted on create | `null` | Plain `name` |
| omitted on update | unchanged | unchanged |
| `null` or `""` | `null` | Plain `name` |
| HTML string | that HTML | Rendered as HTML |

Maximum length is 10000 characters. Existing records stay `null` until an admin saves a heading.

---

## Endpoints

The field is on the existing create, update, and detail calls. There is no new route.

| Master | Create | Update | Detail |
|--------|--------|--------|--------|
| Brand | `POST /master/brands` | `PATCH /master/brands/:refId` | `GET /master/brands/:refId` |
| Category | `POST /master/categories` | `PATCH /master/categories/:refId` | `GET /master/categories/:refId` |
| Health concern | `POST /master/health-concerns` | `PATCH /master/health-concerns/:refId` | `GET /master/health-concerns/:refId` |
| Wellness goal | `POST /master/wellness-goals` | `PATCH /master/wellness-goals/:refId` | `GET /master/wellness-goals/:refId` |

`:refId` is the master ref id. Brand, category, and the other two masters that already use `multipart/form-data` keep that content type. Send `listingHeading` as a text field next to `name`.

Detail `data.listingHeading` is the HTML to load back into the editor, or `null` when none is saved.

```json
{
  "name": "Hair Fall",
  "listingHeading": "<p>Shop <u>Hair Fall</u> care</p>"
}
```

Clear the heading:

```json
{
  "listingHeading": null
}
```

---

## UI

1. Add an optional rich-text control on each master’s create and edit form. Label it as the product-list heading.
2. On edit, load `listingHeading` from the detail response. When it is `null`, leave the editor empty. Do not prefill it with `name`.
3. Keep the existing plain `name` field. Do not replace it with the rich-text value.
4. On save, submit the editor HTML. Submit `null` when the editor is empty.
