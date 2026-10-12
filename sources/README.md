# sources/

Root for the **local folder** connector. Put folders of Markdown / text files here and connect them on the Sources page (or `POST /api/sources {"type":"filesystem","path":"<folder>"}`).

- Paths are resolved inside this directory only; `..`, absolute paths and symlinks that escape it are rejected.
- Override the location with `RADAR_SOURCES_ROOT`.
- Contents are git-ignored: this is where company data goes.
