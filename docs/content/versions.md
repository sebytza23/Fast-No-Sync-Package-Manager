# Documentation versions

The current documentation covers **FNSPM {{version}}**. Use the version menu in the header to switch editions while keeping the same guide whenever it exists in the other edition.

{{versionList}}

## Which edition should I read?

Check the version you have installed:

```sh
fnspm --version
```

Choose that release above. To follow the current release instead, install from npm's `latest` tag:

```sh
npm install -g fnspm
```

The 1.0.0 archive contains the complete guides written for that release. The 0.3.0 archive preserves its original release README and changelog; its navigation reflects the documentation available for that version.

## How archived documentation works

Archived guides keep their own release version, installation examples, navigation and search index. Their content is stored separately from the current guides, so updating the site does not rewrite older release behavior.

A banner identifies archived pages and links to the equivalent current page when available. If that guide did not exist in the other edition, the version menu opens that edition's overview.

Documentation availability does not promise ongoing support or updates for an older release. Read the changelog before upgrading.
