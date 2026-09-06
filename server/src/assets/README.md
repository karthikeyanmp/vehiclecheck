`policelogo.jpg` is the Tamil Nadu Police emblem printed at the top-centre of
the vehicle permit (see `../services/certificate.js`, `EMBLEM_PATH`).

Replace it with a higher-resolution version if you have one — keep the same
filename, or update `EMBLEM_PATH`. The renderer scales it to ~76pt wide and
skips it gracefully if the file is missing.
