import { renderNavbar } from "./navbar.js";
import { formatKc } from "./utils.js";

renderNavbar();

const BUNDLES = [
  { kc: 60, price: 6.99 },
  { kc: 180, price: 20.97 },
  { kc: 690, price: 80.39 },
  { kc: 1200, price: 139.8 }
];

document.getElementById("bundle-list").innerHTML = BUNDLES.map(
  (b) => `
  <div class="post-card" style="padding:16px;display:flex;align-items:center;justify-content:space-between">
    <div>
      <p style="margin:0;font-weight:600;font-size:16px">${formatKc(b.kc)}</p>
      <p class="hint-text" style="margin:2px 0 0">≈ ${(b.kc * 0.1165).toFixed(2)} $CAD de valeur</p>
    </div>
    <span class="btn-outline" style="pointer-events:none">${b.price.toFixed(2)} $CAD</span>
  </div>
`
).join("");
