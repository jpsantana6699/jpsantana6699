import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const LOGIN = process.env.GITHUB_USER;
const TOKEN = process.env.GITHUB_TOKEN;
const OUTPUT = process.env.OUTPUT ?? "dist/github-stats.svg";
const TOP_LANGUAGES = 6;

const QUERY = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar { totalContributions }
      totalCommitContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      totalIssueContributions
    }
    repositories(ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, first: 100) {
      totalCount
      nodes {
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name color } }
        }
      }
    }
  }
}`;

const theme = {
  background: "#0D1117",
  border: "#30363D",
  title: "#7AB1F0",
  label: "#8B949E",
  value: "#E6EDF3",
  track: "#21262D",
};

async function fetchUser() {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } }),
  });
  const { data, errors } = await response.json();
  if (errors) throw new Error(JSON.stringify(errors));
  return data.user;
}

function languageShares(repositories) {
  const totals = new Map();
  for (const repository of repositories) {
    const edges = repository.languages.edges;
    const repositorySize = edges.reduce((sum, edge) => sum + edge.size, 0);
    for (const { size, node } of edges) {
      const current = totals.get(node.name) ?? { name: node.name, color: node.color ?? theme.label, share: 0 };
      current.share += size / repositorySize;
      totals.set(node.name, current);
    }
  }
  const total = [...totals.values()].reduce((sum, language) => sum + language.share, 0);
  return [...totals.values()]
    .map((language) => ({ ...language, share: language.share / total }))
    .sort((a, b) => b.share - a.share)
    .slice(0, TOP_LANGUAGES);
}

const formatNumber = (value) => value.toLocaleString("pt-BR");
const formatPercent = (value) => `${(value * 100).toFixed(1).replace(".", ",")}%`;

function statTile({ label, value }, index) {
  const x = 32 + (index % 3) * 130;
  const y = 86 + Math.floor(index / 3) * 70;
  return `
    <text x="${x}" y="${y}" class="value">${formatNumber(value)}</text>
    <text x="${x}" y="${y + 22}" class="label">${label}</text>`;
}

function languageSection(languages) {
  const barX = 452;
  const barWidth = 336;
  const scale = barWidth / languages.reduce((sum, language) => sum + language.share, 0);
  let offset = barX;
  const segments = languages.map((language) => {
    const width = language.share * scale;
    const segment = `<rect x="${offset}" y="64" width="${width}" height="10" fill="${language.color}"/>`;
    offset += width;
    return segment;
  });
  const legend = languages.map((language, index) => {
    const x = barX + (index % 2) * 170;
    const y = 108 + Math.floor(index / 2) * 30;
    return `
    <circle cx="${x + 5}" cy="${y - 4}" r="5" fill="${language.color}"/>
    <text x="${x + 18}" y="${y}" class="lang">${language.name}</text>
    <text x="${x + 150}" y="${y}" class="percent" text-anchor="end">${formatPercent(language.share)}</text>`;
  });
  return `
    <clipPath id="bar"><rect x="${barX}" y="64" width="${barWidth}" height="10" rx="5"/></clipPath>
    <rect x="${barX}" y="64" width="${barWidth}" height="10" rx="5" fill="${theme.track}"/>
    <g clip-path="url(#bar)">${segments.join("")}</g>
    ${legend.join("")}`;
}

function renderCard(user) {
  const contributions = user.contributionsCollection;
  const stats = [
    { label: "Contribuições no ano", value: contributions.contributionCalendar.totalContributions },
    { label: "Commits", value: contributions.totalCommitContributions },
    { label: "Pull requests", value: contributions.totalPullRequestContributions },
    { label: "Issues", value: contributions.totalIssueContributions },
    { label: "Code reviews", value: contributions.totalPullRequestReviewContributions },
    { label: "Repositórios", value: user.repositories.totalCount },
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="200" viewBox="0 0 820 200" role="img" aria-label="Estatísticas do GitHub">
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
    .title { font-size: 15px; font-weight: 600; fill: ${theme.title}; }
    .value { font-size: 26px; font-weight: 700; fill: ${theme.value}; }
    .label { font-size: 12px; fill: ${theme.label}; }
    .lang { font-size: 13px; fill: ${theme.value}; }
    .percent { font-size: 12px; fill: ${theme.label}; }
  </style>
  <rect x="0.5" y="0.5" width="819" height="199" rx="10" fill="${theme.background}" stroke="${theme.border}"/>
  <text x="32" y="36" class="title">Atividade no último ano</text>
  <text x="452" y="36" class="title">Linguagens mais usadas</text>
  <line x1="420" y1="28" x2="420" y2="172" stroke="${theme.border}"/>
  ${stats.map(statTile).join("")}
  ${languageSection(languageShares(user.repositories.nodes))}
</svg>
`;
}

const user = await fetchUser();
mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, renderCard(user));
