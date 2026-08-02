# T10 font subset evidence

## Result

The local font payload now contains only the authored weights used as the site's weight anchors: 300, 400, and 700 for both Roboto and Suisse. CSS requests between those anchors continue to use normal browser weight matching.

| Family | Weight | File | Before bytes | After bytes | SHA-256 after |
| --- | ---: | --- | ---: | ---: | --- |
| Roboto | 300 | `Roboto-Light.woff2` | 24,244 | 10,300 | `6ddbff32add093165b25af3894cf186c06adeb5a0c80ab85a26bc73fb06ab9e8` |
| Roboto | 400 | `Roboto-Regular.woff2` | 31,136 | 14,528 | `ae13547e1cfebe93bfaee1f76b6702295b350678157736534ec77328d0a9efb2` |
| Roboto | 700 | `Roboto-Bold.woff2` | 31,344 | 14,724 | `0bdc0f3b2def072598351ed39c8599ff0625788d05a8b549e0f9deef739e3cb9` |
| Suisse Intl | 300 | `suisseintl-light.woff2` | 28,632 | 15,076 | `d75b23e45ef0cd394a68d8c35803a908e99d4a04fad67e61d8c5d45c135e9ebc` |
| Suisse Intl | 400 | `SuisseIntl-Regular.woff2` | 21,048 | 10,264 | `edf327b94adefe191ce671d2542c066e94c71eb91e067e13a915c76007c7427f` |
| Suisse Intl | 700 | `SuisseIntl-Bold.woff2` | 21,164 | 10,232 | `ca6797743a635ad07854813d66f5afc0e5fd6925c26f794e96323529a9204483` |

The three removed intermediate files were `Roboto-Medium.woff2`, `suisseintl-medium.woff2`, and `SuisseIntl-SemiBold.woff2`. They remain recoverable from Git history and a local ignored copy is held under `work/font-archive/`.

Total font bytes changed from 238,900 to 75,124 bytes, a reduction of 163,776 bytes (68.56%). The final total is below the 80 KiB acceptance ceiling.

## Deterministic subset

Each retained file was processed with FontTools 4.62.1 using WOFF2 output, canonical glyph order, preserved layout features, and no timestamp recalculation. The requested allowlist covers the site's rendered Basic Latin text plus the four non-ASCII characters present in `src/`: `©`, `·`, `—`, and `✓`. The check mark was not present in either original family and therefore continues to render through the existing sans-serif fallback; every glyph supplied by the original files and requested below is present in all six subsets.

```text
U+0020,U+0021,U+0022,U+0026-003B,U+003F-005A,U+0061-007A,U+00A9,U+00B7,U+2014,U+2713
```

Suisse is the only preloaded local family because it renders the first-screen heading through `--font-display`. Roboto remains `preload: false`. The same Suisse `localFont` instance supplies both the preload and runtime CSS, so no duplicate browser font source is introduced.
