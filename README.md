# Address List Jotform Widget - Starter

A configurable Jotform custom widget for collecting multiple Housing or Worksite locations.

## Included in this starter

- One codebase with `housing` and `worksite` modes
- Manual address entry
- Add, Edit, Cancel Edit, and Delete
- Address cards/tiles
- State dropdown
- Mode-specific validation
- Prefill from an existing Jotform field by Field ID
- Parser for the current newline-delimited Google Sheet formats
- Serializer back to compact newline-delimited text
- Ready for GitHub Pages hosting
- Placeholder metadata (`latitude`, `longitude`, `source`) for future autocomplete/map support

## Suggested Jotform widget settings

Create these custom widget settings in Jotform:

- `addressType` - text/dropdown; expected values: `housing` or `worksite`
- `prefillFieldId` - text; Jotform field ID containing the prefilled multiline address string

If `addressType` is missing or invalid, the widget defaults to `worksite`.

## Supported prefill formats

### Housing

One record per line:

```text
1086 S Meriden Rd, Cheshire, CT 06410, NAUGATUCK VALLEY PLANNING REGION (Employer-owned | Units: 1 | Occupancy: 6)
1045 S Meriden Rd, Cheshire, CT 06410, NAUGATUCK VALLEY PLANNING REGION (Employer-owned | Units: 1 | Occupancy: 10)
```

### Worksite

One record per line:

```text
Brumfield Angus Farms LLC: 0701 S 500 E., La Porte, IN 46350, LAPORTE COUNTY: 11/16-04/01 (4 workers)
Brumfield Angus Farms LLC: V/L Wee-Chik Rd., Sawyer, MI 49125, BERRIEN COUNTY: 11/16-04/01 (4 workers)
```

## Important starter assumptions

1. Prefilled worksite owner text is interpreted as `ownedByEmployer: false`. If there is no owner prefix before the address, it is interpreted as employer-owned.
2. Historical worksite dates such as `11/16-04/01` do not contain a year, so they are retained as strings when imported. Newly entered dates use HTML date inputs and are stored internally as ISO `YYYY-MM-DD` values.
3. Output is serialized back to the compact multiline format rather than JSON.
4. The parser is intentionally forgiving. Historical records with malformed state/ZIP values will still load partially so the user can edit them.
5. Address autocomplete, geocoding, reverse geocoding, and map pinning are not yet implemented. The core object model already includes `latitude`, `longitude`, and `source` so those can be added later.

## GitHub Pages

Upload the files to a repository and enable GitHub Pages for the branch/folder you want to publish. Keep the four runtime files together:

- `index.html`
- `styles.css`
- `states.js`
- `address-widget.js`

Then use the published `index.html` URL as the Jotform custom widget URL.
