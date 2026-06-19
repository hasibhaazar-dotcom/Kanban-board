const DEFAULT_BOARD = {
    columns: [
        { id: "backlog", title: "Backlog", cards: [] },
        { id: "todo", title: "To Do", cards: [] },
        { id: "inprogress", title: "In Progress", cards: [] },
        { id: "done", title: "Done", cards: [] }
    ]
};

let board = loadBoard();
let draggedCardId = null;
let draggedFromCol = null;
let currentFilter = "all";

function loadBoard() {
    const raw = localStorage.getItem("kanban-board");
    return raw ? JSON.parse(raw) : structuredClone(DEFAULT_BOARD);
}

function saveBoard() {
    localStorage.setItem("kanban-board", JSON.stringify(board));
}

function renderBoard() {
    const boardEl = document.getElementById("board");
    boardEl.innerHTML = "";

    board.columns.forEach(column => {
        const col = document.createElement("div");
        col.className = "column";
        col.dataset.id = column.id;

        col.innerHTML = `
            <div class="column-header">
                <h2>${column.title}</h2>
                <span>${column.cards.length}</span>
            </div>
            <div class="card-list"></div>
            <button class="add-card-btn">+ Add Card</button>
        `;

        const cardList = col.querySelector(".card-list");

        column.cards.forEach(card => {
            const cardEl = createCardElement(card, column.id);
            cardList.appendChild(cardEl);
        });

        setupColumnDrag(cardList, column.id);
        setupAddCard(col, column.id);

        boardEl.appendChild(col);
    });

    applyFilters();
}

function createCardElement(card, colId) {
    const cardEl = document.createElement("div");
    cardEl.className = `card priority-${card.priority}`;
    if (colId === "done") cardEl.classList.add("done");

    cardEl.draggable = true;
    cardEl.tabIndex = 0;
    cardEl.dataset.id = card.id;

    cardEl.innerHTML = `
        <div class="card-title">${card.title}</div>
        <div class="card-desc">${card.description || ""}</div>
        <select class="priority-select">
            <option ${card.priority === "P1" ? "selected" : ""}>P1</option>
            <option ${card.priority === "P2" ? "selected" : ""}>P2</option>
            <option ${card.priority === "P3" ? "selected" : ""}>P3</option>
            <option ${card.priority === "P4" ? "selected" : ""}>P4</option>
        </select>
    `;

    cardEl.addEventListener("dragstart", e => {
        draggedCardId = card.id;
        draggedFromCol = colId;
        cardEl.classList.add("dragging");
    });

    cardEl.addEventListener("dragend", () => {
        cardEl.classList.remove("dragging");
    });

    enableInlineEdit(cardEl, card, colId);

    cardEl.querySelector(".priority-select").addEventListener("change", e => {
        card.priority = e.target.value;
        saveBoard();
        renderBoard();
    });

    cardEl.addEventListener("keydown", e => {
        if (e.code === "Space") {
            e.preventDefault();
            showContextMenu(cardEl, card, colId);
        }
    });

    return cardEl;
}

function setupColumnDrag(cardList, colId) {
    cardList.addEventListener("dragover", e => {
        e.preventDefault();

        const afterElement = getCardAfterCursor(cardList, e.clientY);
        const dragging = document.querySelector(".dragging");

        if (!dragging) return;

        if (afterElement == null) {
            cardList.appendChild(dragging);
        } else {
            cardList.insertBefore(dragging, afterElement);
        }
    });

    cardList.addEventListener("drop", e => {
        e.preventDefault();

        if (!draggedCardId) return;

        const sourceCol = board.columns.find(c => c.id === draggedFromCol);
        const targetCol = board.columns.find(c => c.id === colId);

        const cardIndex = sourceCol.cards.findIndex(c => c.id === draggedCardId);
        const [movedCard] = sourceCol.cards.splice(cardIndex, 1);

        const afterElement = getCardAfterCursor(cardList, e.clientY);

        if (!afterElement) {
            targetCol.cards.push(movedCard);
        } else {
            const index = targetCol.cards.findIndex(
                c => c.id === afterElement.dataset.id
            );
            targetCol.cards.splice(index, 0, movedCard);
        }

        saveBoard();
        renderBoard();
    });
}

function getCardAfterCursor(column, y) {
    const cards = [...column.querySelectorAll(".card:not(.dragging)")];

    return cards.reduce((closest, card) => {
        const box = card.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;

        if (offset < 0 && offset > closest.offset) {
            return { offset, element: card };
        }

        return closest;
    }, { offset: -Infinity }).element;
}

function setupAddCard(colEl, colId) {
    const btn = colEl.querySelector(".add-card-btn");

    btn.onclick = () => {
        const form = document.createElement("div");
        form.className = "add-form";

        form.innerHTML = `
            <textarea placeholder="Title"></textarea>
            <textarea placeholder="Description"></textarea>
            <select>
                <option>P1</option>
                <option>P2</option>
                <option>P3</option>
                <option>P4</option>
            </select>
            <button class="confirm">Add</button>
            <button class="cancel">Cancel</button>
        `;

        btn.replaceWith(form);

        form.querySelector(".confirm").onclick = () => {
            const textareas = form.querySelectorAll("textarea");

            const newCard = {
                id: crypto.randomUUID(),
                title: textareas[0].value,
                description: textareas[1].value,
                priority: form.querySelector("select").value,
                createdAt: Date.now()
            };

            board.columns.find(c => c.id === colId).cards.push(newCard);

            saveBoard();
            renderBoard();
        };

        form.querySelector(".cancel").onclick = renderBoard;
    };
}

function enableInlineEdit(cardEl, card) {
    ["card-title", "card-desc"].forEach(cls => {
        const el = cardEl.querySelector("." + cls);

        el.ondblclick = () => {
            const old = el.textContent;
            el.contentEditable = true;
            el.focus();

            el.onkeydown = e => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    saveEdit();
                }
                if (e.key === "Escape") {
                    el.textContent = old;
                    stopEdit();
                }
            };

            el.onblur = saveEdit;

            function saveEdit() {
                if (cls === "card-title") card.title = el.textContent;
                else card.description = el.textContent;

                stopEdit();
                saveBoard();
            }

            function stopEdit() {
                el.contentEditable = false;
            }
        };
    });
}

function showContextMenu(cardEl, card, colId) {
    let menu = cardEl.querySelector(".context-menu");

    if (menu) {
        menu.remove();
        return;
    }

    menu = document.createElement("div");
    menu.className = "context-menu";

    menu.innerHTML = `
        <button class="move">Move Next</button>
        <button class="delete">Delete</button>
    `;

    menu.querySelector(".move").onclick = () => {
        const cols = board.columns;
        const index = cols.findIndex(c => c.id === colId);

        if (index < cols.length - 1) {
            cols[index].cards = cols[index].cards.filter(c => c.id !== card.id);
            cols[index + 1].cards.push(card);
        }

        saveBoard();
        renderBoard();
    };

    menu.querySelector(".delete").onclick = () => {
        board.columns.forEach(col => {
            col.cards = col.cards.filter(c => c.id !== card.id);
        });

        saveBoard();
        renderBoard();
    };

    cardEl.appendChild(menu);
}

function applyFilters() {
    const query = document.getElementById("searchInput").value.toLowerCase();

    document.querySelectorAll(".card").forEach(card => {
        const text = card.innerText.toLowerCase();
        const priority = card.className.match(/priority-(P\d)/)?.[1];

        const matchSearch = text.includes(query);
        const matchPriority = currentFilter === "all" || priority === currentFilter;

        card.classList.toggle("fade", !(matchSearch && matchPriority));
    });
}

document.getElementById("searchInput").addEventListener("input", applyFilters);

document.querySelectorAll(".filter").forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll(".filter").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentFilter = btn.dataset.priority;
        applyFilters();
    };
});

renderBoard();
