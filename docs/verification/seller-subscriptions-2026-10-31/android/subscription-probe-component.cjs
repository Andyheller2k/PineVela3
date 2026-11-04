var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/components/SellerSubscriptionPlans.tsx
var SellerSubscriptionPlans_exports = {};
__export(SellerSubscriptionPlans_exports, {
  default: () => SellerSubscriptionPlans
});
module.exports = __toCommonJS(SellerSubscriptionPlans_exports);
var import_react = require("react");

// marketPlans.ts
var MARKET_PLANS = ["default", "star", "pro"];
var PLAN_LIMITS = { default: { items: 20, services: 1, inventory: 200 }, star: { items: 100, services: 5, inventory: 600 }, pro: { items: 200, services: 10, inventory: 900 } };
function marketPlanBenefits(plan) {
  return { subscriptionPlan: plan, isPineStar: plan === "star" || plan === "pro", hasGoldFrame: plan === "pro", hasPriorityPlacement: plan === "pro" };
}

// src/lib/sellerPlanComparison.ts
var SELLER_PLAN_NAMES = { default: "Default", star: "Star", pro: "Pro" };
function nextSellerPlan(current) {
  return current === "default" ? "star" : current === "star" ? "pro" : null;
}
function sellerPlanPrice(prices, plan) {
  const price = prices?.[plan];
  return typeof price === "number" && Number.isFinite(price) && price >= 0 ? price : void 0;
}
function formatSellerPlanPrice(prices, plan) {
  const price = sellerPlanPrice(prices, plan);
  return price === void 0 ? prices ? "Price unavailable" : "Loading prices\u2026" : `GH\u20B5${price.toFixed(2)}`;
}
function sellerPlanFeatures(current) {
  const capacity = [
    { key: "items", emoji: "\u{1F4E6}", label: "Item listings", description: "Active at a time", value: (plan) => String(PLAN_LIMITS[plan].items) },
    { key: "services", emoji: "\u{1F6E0}\uFE0F", label: "Service listings", description: "Active at a time", value: (plan) => String(PLAN_LIMITS[plan].services) },
    { key: "inventory", emoji: "\u{1F6CD}\uFE0F", label: "Inventory units", description: "Total stock capacity", value: (plan) => String(PLAN_LIMITS[plan].inventory) }
  ];
  return capacity.concat(current === "default" ? [
    { key: "cover", emoji: "\u{1F3A8}", label: "Store cover", description: "Four designs or your own", value: (plan) => marketPlanBenefits(plan).isPineStar ? "Custom" : "4 designs" },
    { key: "badge", emoji: "\u{1F31F}", label: "Glowing badge", description: "On your listings", value: (plan) => marketPlanBenefits(plan).isPineStar || "Standard" },
    { key: "logo", emoji: "\u{1F34D}", label: "Store logo", description: "Your brand, front & centre", value: (plan) => marketPlanBenefits(plan).isPineStar ? "Custom" : "PineVela" }
  ] : [
    { key: "branding", emoji: "\u{1F3A8}", label: "Store branding", description: "Your logo & cover", value: (plan) => marketPlanBenefits(plan).isPineStar },
    { key: "frames", emoji: "\u{1F48E}", label: "Golden frames", description: "Around your listings", value: (plan) => marketPlanBenefits(plan).hasGoldFrame },
    { key: "priority", emoji: "\u{1F680}", label: "Search placement", description: "In featured results", value: (plan) => marketPlanBenefits(plan).hasPriorityPlacement ? "Priority" : "Standard" }
  ]);
}

// src/components/SellerSubscriptionPlans.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function FeatureValue({ value }) {
  if (typeof value === "boolean") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { role: "img", "aria-label": value ? "Included" : "Not included", className: value ? "seller-plan-tick" : "seller-plan-not-included", children: value ? "\u2713" : "\u2212" });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: value });
}
function SellerSubscriptionPlans({ currentPlan, prices, busy, error, onChoose, onKeep }) {
  const headingId = (0, import_react.useId)(), comparisonId = (0, import_react.useId)();
  const nextPlan = nextSellerPlan(currentPlan), targetPlan = nextPlan || currentPlan;
  const currentName = SELLER_PLAN_NAMES[currentPlan], targetName = SELLER_PLAN_NAMES[targetPlan];
  const priceAvailable = sellerPlanPrice(prices, targetPlan) !== void 0;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { "data-seller-subscriptions": true, "data-current-plan": currentPlan, "data-next-plan": nextPlan || "none", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "seller-plan-card", "aria-labelledby": headingId, "aria-busy": busy, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "seller-plan-intro", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "seller-plan-eyebrow", children: nextPlan ? "A little more possibility" : "Your current plan" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "seller-plan-hero-icon", "aria-hidden": "true", children: targetPlan === "star" ? "\u{1F31F}" : "\u{1F48E}" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", { id: headingId, children: [
          nextPlan ? targetPlan === "star" ? "Stand out with" : "Go further with" : "You\u2019re on",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("em", { children: [
            "Pine ",
            targetName,
            "."
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: nextPlan === "star" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          "More room for your products.",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
          "More personality for your store."
        ] }) : nextPlan === "pro" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          "More capacity. Golden frames.",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
          "Priority in featured searches."
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          "Your highest PineVela seller tier.",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
          "Keep your store moving forward."
        ] }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "seller-plan-comparison-wrap", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: "seller-plan-comparison", "aria-label": nextPlan ? `Pine ${currentName} and Pine ${targetName} comparison` : "Your Pine Pro benefits", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("colgroup", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("col", { className: nextPlan ? "seller-plan-feature-col" : "seller-plan-feature-col-solo" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("col", { className: "seller-plan-value-col" }),
          nextPlan && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("col", { className: "seller-plan-value-col" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", children: nextPlan ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
            "Find your next",
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
            "step forward."
          ] }) : "Your included benefits" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("th", { scope: "col", className: !nextPlan ? "seller-plan-next-head" : void 0, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "seller-plan-column-label", children: "Your plan" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "seller-plan-name", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Pine" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: currentName })
            ] })
          ] }),
          nextPlan && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("th", { scope: "col", className: "seller-plan-next-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "seller-plan-column-label", children: "Upgrade" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "seller-plan-name", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Pine" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                targetName,
                " ",
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "aria-hidden": "true", children: "\u2728" })
              ] })
            ] })
          ] })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: sellerPlanFeatures(currentPlan).map((feature) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { "data-plan-feature": feature.key, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "row", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "seller-plan-feature", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "seller-plan-feature-emoji", "aria-hidden": "true", children: feature.emoji }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: feature.label }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: feature.description })
            ] })
          ] }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: !nextPlan ? "seller-plan-next-value" : void 0, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FeatureValue, { value: feature.value(currentPlan) }) }),
          nextPlan && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "seller-plan-next-value", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FeatureValue, { value: feature.value(nextPlan) }) })
        ] }, feature.key)) })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("footer", { className: "seller-plan-upgrade-area", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "seller-plan-price-line", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { "aria-live": "polite", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "data-subscription-price": targetPlan, children: formatSellerPlanPrice(prices, targetPlan) }),
            priceAvailable && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: " / month" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "seller-plan-renewal-pill", children: "No automatic debit" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", "data-subscription-checkout": targetPlan, disabled: busy || !priceAvailable, onClick: () => onChoose(targetPlan), className: "seller-plan-upgrade", children: busy ? "Opening checkout\u2026" : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          nextPlan ? "Upgrade to" : "Renew",
          " Pine ",
          targetName,
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "aria-hidden": "true", children: "\u2192" })
        ] }) }),
        error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "alert", className: "seller-plan-payment-error", children: error }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled: busy, onClick: onKeep, className: "seller-plan-keep", children: nextPlan ? `Keep Pine ${currentName}` : "Back to my store" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "seller-plan-payment-note", children: "Secure checkout \xB7 Review the total before paying" })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { className: "seller-plan-other-plans", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { "aria-controls": comparisonId, children: "See all plans and renewal prices" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { id: comparisonId, children: MARKET_PLANS.map((plan) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { "data-plan-option": plan, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "aria-hidden": "true", children: plan === "default" ? "\u{1F34D}" : plan === "star" ? "\u{1F31F}" : "\u{1F48E}" }),
            " Pine ",
            SELLER_PLAN_NAMES[plan]
          ] }),
          plan === currentPlan && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "seller-plan-current-tag", children: "Current plan" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { children: [
            PLAN_LIMITS[plan].items,
            " items \xB7 ",
            PLAN_LIMITS[plan].services,
            " ",
            PLAN_LIMITS[plan].services === 1 ? "service" : "services",
            " \xB7 ",
            PLAN_LIMITS[plan].inventory,
            " units"
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { className: "seller-plan-option-price", "aria-live": "polite", children: [
          formatSellerPlanPrice(prices, plan),
          sellerPlanPrice(prices, plan) !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: " / month" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled: busy || sellerPlanPrice(prices, plan) === void 0, onClick: () => onChoose(plan), "aria-label": `${plan === currentPlan ? "Renew" : "Choose"} Pine ${SELLER_PLAN_NAMES[plan]}`, children: plan === currentPlan ? "Renew" : "Choose" })
      ] }, plan)) })
    ] })
  ] });
}
