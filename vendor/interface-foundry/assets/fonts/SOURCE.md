# Local font sources

These files are unmodified downloads from the official [Google Fonts repository](https://github.com/google/fonts). Both font families use the SIL Open Font License, version 1.1; their complete licenses and copyright notices are included alongside the font files.

| Local file | Official source | CSS weight/style | License file |
| --- | --- | --- | --- |
| `BarlowCondensed-ExtraBold.ttf` | [Barlow Condensed ExtraBold](https://raw.githubusercontent.com/google/fonts/main/ofl/barlowcondensed/BarlowCondensed-ExtraBold.ttf) | `font-weight: 800; font-style: normal` | `BarlowCondensed-OFL.txt` |
| `SpaceGrotesk-Variable.ttf` | [Space Grotesk variable font](https://raw.githubusercontent.com/google/fonts/main/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf) | `font-weight: 300 700; font-style: normal` | `SpaceGrotesk-OFL.txt` |

The Space Grotesk file is renamed locally from `SpaceGrotesk[wght].ttf`; its bytes are unchanged. Its variable `wght` axis supports weights 300–700. Barlow Condensed ExtraBold is a static weight 800 font. These weights were verified from the downloaded fonts' OpenType tables.

License sources:

- [Barlow Condensed OFL](https://raw.githubusercontent.com/google/fonts/main/ofl/barlowcondensed/OFL.txt): Copyright 2017 The Barlow Project Authors.
- [Space Grotesk OFL](https://raw.githubusercontent.com/google/fonts/main/ofl/spacegrotesk/OFL.txt): Copyright 2020 The Space Grotesk Project Authors.

Example declarations for a stylesheet located in `assets/`:

```css
@font-face {
  font-family: "Barlow Condensed";
  src: url("./fonts/BarlowCondensed-ExtraBold.ttf") format("truetype");
  font-style: normal;
  font-weight: 800;
  font-display: swap;
}

@font-face {
  font-family: "Space Grotesk";
  src: url("./fonts/SpaceGrotesk-Variable.ttf") format("truetype");
  font-style: normal;
  font-weight: 300 700;
  font-display: swap;
}
```
