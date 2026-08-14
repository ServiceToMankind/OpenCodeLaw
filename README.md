# OpenCodeLaw

<p align="center">
  <a href="https://constitution.stmorg.in"><img src="assets/img/openlawcode_banner.png" width="700px" alt="OpenLawCode Banner"></a>
</p>

OpenCodeLaw is a project that allows you to dynamically generate a constitution page based on YAML specifications. It provides a user-friendly interface for displaying constitution articles and sections.

> **Rebuild in progress (branch `rebuild/v3`).** The CDN install instructions below are obsolete and
> are removed in Phase 7. See [AUDIT-CONFIRMED.md](AUDIT-CONFIRMED.md) for what is broken and why.

## Requirements

Node **20 or 22**. CI runs both. `engines` allows `>=18.18.0` only so the build stays verifiable on
the maintainer's current machine.

> **Node 18 reached end of life in April 2025 and no longer receives security patches.**
> Move the local floor to **Node 22 LTS before Phase 4 ships.** It is not a supported target — only
> a tolerated one, and only for the remainder of this rebuild.

### Deferred upgrade, gated on that floor move

`sanitize-html` is pinned to **2.17.5**, two patches behind. This is deliberate and time-limited.

2.17.6+ depends on `htmlparser2@^12`, which is ESM-only, so it **cannot load on Node 18 at all** —
`require()` fails outright. It is a hard break, not an `engines` warning. 2.17.5 is the newest
release that runs on the current floor.

2.17.6/2.17.7 do carry real security fixes worth taking:

- SVG SMIL animation elements (`<animate>`, `<set>`, …) can retarget another element's `href` via
  `attributeName`/`values`, smuggling a `javascript:` URI past scheme validation.
- Raw `<` surviving out of `<textarea>`/`<xmp>` can reopen a tag when the output is re-parsed.

Neither is reachable in this engine's configuration: the sanitizer runs a strict allowlist over
Markdown-rendered output that permits no SVG and no animation elements, so there is no element for
the vector to retarget. The exposure is defence-in-depth, not a live hole.

**When the floor moves to Node 22, bump `sanitize-html` to `2.17.7` in the same change.**

## Getting Started

To use OpenCodeLaw, follow these steps:

1. Create an HTML file (e.g., `index.html`) and add the following content:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OpenCodeLaw Ui</title>
    <!-- Include theme's CSS -->
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/gh/ServiceToMankind/opencodelaw@2.0.0/css/style.css"
    />
  </head>
  <body>
    <!-- Replace 'YOUR_SPEC_URL' with your own YAML specification URL -->
    <opencodelaw spec-url="YOUR_SPEC_URL"></opencodelaw>

    <!-- Include required scripts -->
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/js-yaml/4.0.0/js-yaml.min.js"></script>
    <script src="https://cdn.jsdelivr.net/gh/ServiceToMankind/opencodelaw@2.0.0/js/opencodelaw.js"></script>
  </body>
</html>
```

2. Replace 'YOUR_SPEC_URL' in the spec-url attribute with the URL of your YAML specification file.

3. Open the HTML file in a web browser to see the dynamically generated constitution page.

## Usage

1. Update the spec-url attribute in the HTML file with the URL of your own YAML specification.

2. The generated page will display the constitution sections and articles based on the provided YAML data.

# OpenCodeLaw YAML Schema Explanation

The OpenCodeLaw YAML schema defines the structure of the constitution for the organization. This schema provides a clear and organized way to outline various sections, articles, and amendments of the constitution. Here's a breakdown of each key in the [schema](https://github.com/ServiceToMankind/OpenCodeLaw/blob/main/schema/opencodelaw.md).

## Contributing

Contributions to the OpenCodeLaw project are welcome! Feel free to fork the repository, make changes, and submit pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](https://github.com/ServiceToMankind/OpenCodeLaw/blob/main/LICENSE) file for details.
