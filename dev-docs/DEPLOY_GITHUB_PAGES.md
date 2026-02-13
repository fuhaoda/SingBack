# Deploy SingBack to GitHub Pages

This repo uses the `main/docs` strategy (no GitHub Actions required).

## One-time GitHub setting

1. Open repository `Settings -> Pages`.
2. Set `Source` to `Deploy from a branch`.
3. Set `Branch` to `main` and folder to `/docs`.
4. Save.

## Every release

Run from repo root:

```bash
npm run test:run
npm run lint
npm run build
npm run build:pages
```

Then commit and push source + `docs/` artifacts together.

## Local verification before push

```bash
./start_local.sh
```

Open `http://127.0.0.1:8080`.

If port `8080` is occupied:

```bash
cd docs
python3 -m http.server 8090
```

Open `http://127.0.0.1:8090`.

## Production URL

- `https://fuhaoda.github.io/SingBack/`

