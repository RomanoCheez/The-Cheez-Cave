const TYPE_ICONS = {
  hard: "🧀",
  "semi-soft": "🧀",
  soft: "🫕",
  fresh: "🥛",
  blue: "🔵",
  other: "🧀",
};

const listEl = document.getElementById("cheese-list");
const emptyEl = document.getElementById("empty");
const countEl = document.getElementById("count");
const formEl = document.getElementById("cheese-form");
const errorEl = document.getElementById("form-error");

async function api(path, options) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

function render(cheeses) {
  countEl.textContent = String(cheeses.length);
  emptyEl.hidden = cheeses.length > 0;
  listEl.replaceChildren(
    ...cheeses.map((cheese) => {
      const li = document.createElement("li");
      li.className = "cheese";
      li.dataset.id = cheese.id;

      const icon = document.createElement("div");
      icon.className = "cheese__icon";
      icon.textContent = TYPE_ICONS[cheese.type] ?? "🧀";

      const body = document.createElement("div");
      body.className = "cheese__body";

      const title = document.createElement("div");
      title.className = "cheese__title";
      const strong = document.createElement("strong");
      strong.textContent = cheese.name;
      title.appendChild(strong);
      if (cheese.type) {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = cheese.type;
        title.appendChild(tag);
      }
      body.appendChild(title);

      if (cheese.origin) {
        const meta = document.createElement("p");
        meta.className = "cheese__meta";
        meta.textContent = `from ${cheese.origin}`;
        body.appendChild(meta);
      }

      if (cheese.notes) {
        const notes = document.createElement("p");
        notes.className = "cheese__notes";
        notes.textContent = cheese.notes;
        body.appendChild(notes);
      }

      const remove = document.createElement("button");
      remove.className = "cheese__remove";
      remove.title = "Remove from cave";
      remove.setAttribute("aria-label", `Remove ${cheese.name}`);
      remove.textContent = "✕";
      remove.addEventListener("click", () => removeCheese(cheese.id));

      li.append(icon, body, remove);
      return li;
    }),
  );
}

async function load() {
  render(await api("/api/cheeses"));
}

async function removeCheese(id) {
  await api(`/api/cheeses/${id}`, { method: "DELETE" });
  await load();
}

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.hidden = true;
  const data = Object.fromEntries(new FormData(formEl).entries());
  try {
    await api("/api/cheeses", { method: "POST", body: JSON.stringify(data) });
    formEl.reset();
    document.getElementById("name").focus();
    await load();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
});

load().catch((err) => {
  errorEl.textContent = `Could not reach the cave: ${err.message}`;
  errorEl.hidden = false;
});
