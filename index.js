const importLedgerFileInput = document.getElementById("import-ledger-file-input");
const submitLedgerBtn = document.getElementById("submit-ledger-btn");
const createNewLedgerBtn = document.getElementById("create-new-ledger-btn");

const cancelFormBtn = document.getElementById("cancel-form-btn");
const createNewAccountBtn = document.getElementById("create-new-account-btn");
const doManualJournalEntryBtn = document.getElementById("do-manual-journal-entry-btn");
const createNewTransactionTemplateBtn = document.getElementById("create-new-transaction-template-btn");
const doTransactionBtn = document.getElementById("do-transaction-btn");
const closeLedgerBtn = document.getElementById("close-ledger-btn");
const saveLedgerBtn = document.getElementById("save-ledger-btn");
const ledgerState = document.getElementById("ledger-state");

const anyForm = document.getElementById("any-form");

const mainPage = document.getElementById("main");
const greetingPage = document.getElementById("greeting");

let currentLedger = null;
let currentLedgerAccountMap = {}
let currentFormName = null;

function showError(message) {
    alert(message)
    return false;
}

function hasAnyLedgerOpen() {
    return currentLedger !== null;
}

function isValidLedgerShape(obj) {
    return (
        obj &&
        typeof obj === "object" &&
        Array.isArray(obj.chartOfAccounts) &&
        Array.isArray(obj.transactionTemplates) &&
        Array.isArray(obj.transactions)
    );
}

function openLedger(obj) {
    if(hasAnyLedgerOpen()) return showError("Could not open another ledger you need to close it first");
    if(!isValidLedgerShape(obj)) return showError("Invalid ledger");
    currentLedger = obj
    mainPage.classList.toggle("hidden");
    greetingPage.classList.toggle("hidden");
    document.getElementById("ledger-summary").innerText = 
        `Ledger open with ${currentLedger.chartOfAccounts.length} account(s), ${currentLedger.transactions.length} transaction(s)`

    for(const account of currentLedger.chartOfAccounts) {
        currentLedgerAccountMap[account.code] = account;
    }

    renderLedgerState()
    return true;
}

function downloadLedgerAsFile() {
    if (!hasAnyLedgerOpen()) return false;
    const blob = new Blob([JSON.stringify(currentLedger, null, 2)], {
        type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ledger.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    renderLedgerSummary();
    return true;
}

const MAP = {
    "A": "ASSET",
    "L": "LIABILITY",
    "E": "EQUITY",
    "R": "REVENUE",
    "X": "EXPENSE",
}

function addAccount(code, name, kind, amount) {
    if(!code) return showError(`Invalid account code ${code}`);
    if(!name) return showError(`Invalid account kind ${name}`);
    if(!kind) return showError(`Invalid account kind ${kind}`);

    amount = amount || 0

    if (!["A", "L", "R", "E", "X"].includes(code[0])) return showError(
        `Invalid account code ${code}. It must start with either 'A','L','R','E','X' found ${code[0]}`
    );

    if(!["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"].includes(kind)) return showError(
        `Invalid account kind. It must start with either 'ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE'`
    );

    const must = MAP[code[0]]
    if(must !== kind) return showError(
        `Your account code ${code} starts with ${code[0]} but it doesn't map well with the kind ${kind}`
    );
    currentLedger.chartOfAccounts.push({ code, name, kind, amount: parseInt(amount) })
    return true;
}

function addTx(description, entries) {
    // TODO: validate transactions
    let sum = 0;
    for(const [ accountCode, side, currency, amount ] of entries) {
        switch(side) {
            case "D":
                sum += amount;
                break;
            case "C":
                sum -= amount;
                break;
            default:
                return showError(`addTx: entry side ${side} it must be either "D" for Debit or "C" for Credit`);
        }
    }
    if(sum !== 0) 
        return showError("addTx: invalid transaction with unbalance debit and credit entries");
    currentLedger.transactions.push({ D: (description || "N/A"), E: entries, T: (new Date).toISOString() })

    currentLedger.lastTransaction = (new Date()).toISOString()

    renderLedgerState()
}

const KIND_NORMAL_SIDE = {
    "ASSET": "D",
    "LIABILITY": "C",
    "EQUITY": "C",
    "REVENUE": "C",
    "EXPENSE": "D",
}

/** 
 * @param {{ removeAggregatedTransactions: boolean }} options
 */
function aggregateLedgerTransactions(options) {
    // TODO: implement all the stuff in the options
    options = options ?? {}
    currentLedger.lastTransactionAggregation = currentLedger.lastTransactionAggregation ?? (new Date(0)).toISOString()
    const a = new Date(currentLedger.lastTransactionAggregation);
    const b = new Date(currentLedger.lastTransactionRecord);
    if(a > b) return true;

    for(const tx of currentLedger.transactions) {
        const c = new Date(tx.T);
        if(c < a) continue; // Skip aggregated transactions

        for(const [ accountCode, side, currency, amount ] of tx.E) {
            const account = currentLedgerAccountMap[accountCode];
            if(!account) return showError("aggregateLedgerTransactions: Something went wrong")
            const newAmount = side === KIND_NORMAL_SIDE[account.kind] ? amount : -amount;
            console.log(account, newAmount);
            account.amount += newAmount;
            console.log(account);
        }
    }
}

function addTxViaForm(formIndex, formValues, description) {
    const txForm = currentLedger.transactionTemplates[formIndex];
    if(!txForm) return showError(`addTxViaForm: invalid form index ${formIndex} it's out of bound`);
    const entries = []

    for(const [fieldName, fieldAction] of Object.entries(txForm.form)) {
        /** @type {string[]} */
        const actions = fieldAction.split("|");
        let valueNumber = 0;
        let currency  = "IDR";
        for(const action of actions) {
            if(action === "number") {
                const value = formValues[fieldName]
                valueNumber = parseInt(value);
                if(Number.isNaN(valueNumber)) 
                    return showError(`addTxViaForm: invalid form field ${fieldName} with value ${value}. Expected a number got a ${typeof value}`);
            } else if(action.startsWith("debit:")) {
                const account = action.slice(action.search(":")+1);
                entries.push([
                    account,
                    "D",
                    currency,
                    valueNumber,
                ]);
            } else if(action.startsWith("credit:")) {
                const account = action.slice(action.search(":")+1);
                entries.push([
                    account,
                    "C",
                    currency,
                    valueNumber,
                ]);
            }
        }
    }

    if(!addTx(description ?? txForm.title, entries)) return false;
}

function addTemplate(title, fields) {
    currentLedger.transactionTemplates.push({
        title,
        form: fields,
    });
}

function el$(tag) {
    const result = document.createElement(tag);
    result.add$ = function(...items) {
        for(const item of items) {
            if(typeof item === "string") {
                this.appendChild(document.createTextNode(item))
            } else {
                this.appendChild(item)
            }
        }
        return this;
    }
    result.att$ = function(key, value) {
        this.setAttribute(key, value)
        return this
    }

    result.atts$ = function(obj) {
        for (const [key, value] of Object.entries(obj)) {
            this.setAttribute(key, value);
        }
        return this;
    }

    result.body$ = function(callback) {
        callback(this);
        return this;
    }
    result.onclick$ = function(callback) {
        this.onclick = callback
        return this;
    }
    return result;
}

function renderLedgerState() {
    ledgerState.innerHTML = ""
    aggregateLedgerTransactions();
    ledgerState.appendChild(el$("h3").add$("Chart of Accounts"));
    ledgerState.appendChild(el$("table").body$(chartOfAccounts => {
        chartOfAccounts.add$(
            el$("thead").add$(el$("tr").add$(
                el$("td").add$("Code"),
                el$("td").add$("Name"),
                el$("td").add$("Kind"),
                el$("td").add$("Amount"),
            ))
        )
        chartOfAccounts.add$(el$("tbody").body$(tbody => {
            for(const account of currentLedger.chartOfAccounts) {
                tbody.add$(el$("tr").add$(
                    el$("td").add$(`${account.code}`),
                    el$("td").add$(`${account.name}`),
                    el$("td").add$(`${account.kind}`),
                    el$("td").add$(`${account.amount}`),
                ))
            }
        }));
    }));
    ledgerState.appendChild(el$("h3").add$("Transactions"));
    ledgerState.appendChild(el$("table").body$(transactions => {
        transactions.add$(
            el$("thead").add$(el$("tr").add$(
                el$("td").add$("Time"),
                el$("td").add$("Description"),
                el$("td").add$("Entries"),
            ))
        )
        transactions.add$(el$("tbody").body$(tbody => {
            for(const tx of currentLedger.transactions) {
                const e  = (tx.E || []).map(line => `${line[0]} ${line[1]} ${line[3]} ${line[2]}`).join(", ")
                tbody.add$(el$("tr").add$(
                    el$("td").add$(`${tx.T}`),
                    el$("td").add$(`${tx.D}`),
                    el$("td").add$(`${e}`),
                ))
            }
        }));
    }));
    ledgerState.appendChild(el$("h3").add$("Transaction Templates"));
    ledgerState.appendChild(el$("table").body$(templates => {
        templates.add$(
            el$("thead").add$(el$("tr").add$(
                el$("td").add$("Title"),
                el$("td").add$("Fields"),
            ))
        )
        templates.add$(el$("tbody").body$(tbody => {
            for(const tt of currentLedger.transactionTemplates) {
                const fields = Object.entries(tt.form)
                    .map(([label, spec]) => `${label} (${spec})`)
                    .join(", ");
                tbody.add$(el$("tr").add$(
                    el$("td").add$(`${tt.title}`),
                    el$("td").add$(fields)
                ))
            }
        }));
    }));
}

///
/// Operations
///


/**
 * @param {string} formName
 * @param {HTMLFormElement} formElement
 */
function doForm(formName, formElement, onSubmitHandler) {
    if(currentFormName !== null) return showError(`Finish "${currentFormName}" form first`);
    currentFormName = formName
    const currentForm = formElement;

    cancelFormBtn.classList.remove("hidden");
    anyForm.appendChild(currentForm);

    const cancel = () => {
        currentForm.reset()
        cancelFormBtn.removeEventListener("click", cancel);
        currentForm.removeEventListener("submit", submit);
        cancelFormBtn.classList.add("hidden");
        anyForm.removeChild(currentForm);
        currentFormName = null;
    }

    const submit = ev => {
        ev.preventDefault()
        const formData = new FormData(currentForm);
        onSubmitHandler(formData);
        cancel()
    }

    currentForm.addEventListener("submit", submit);
    cancelFormBtn.addEventListener("click", cancel);
}

createNewAccountBtn.addEventListener("click", ev => doForm(
    "New Account Creation",
    el$("form").body$(form => {
        form.add$(el$("h2").add$("Create New Account"));
        form.add$(el$("div").add$(
            el$("label").att$("for", "code").add$("Code:"),
            el$("input")
                .att$("id", "code")
                .att$("name", "code")
                .att$("type", "text")
                .att$("placeholder", "e.g. A-2"),
        ));

        form.add$(el$("div").add$(
            el$("label").att$("for", "name").add$("Name:"),
            el$("input")
                .att$("id", "name")
                .att$("name", "name")
                .att$("type", "text")
                .att$("placeholder", "e.g. Cash"),
        ));
        form.add$(el$("div").add$(
            el$("label").att$("for", "kind").add$("Kind:"),
            el$("select").att$("id", "kind").att$("name", "kind").add$(
                el$("option").att$("value", "ASSET").add$("ASSET"),
                el$("option").att$("value", "LIABILITY").add$("LIABILITY"),
                el$("option").att$("value", "EQUITY").add$("EQUITY"),
                el$("option").att$("value", "REVENUE").add$("REVENUE"),
                el$("option").att$("value", "EXPENSE").add$("EXPENSE"),
            )
        ));
        form.add$(el$("div").add$(
            el$("label").att$("for", "amount").add$("Opening amount:"),
            el$("input")
                .att$("id", "amount")
                .att$("name", "amount")
                .att$("type", "number")
                .att$("value", 0)
        ));
        form.add$(el$("p").add$(el$("button").att$("type", "submit").add$("submit")))
    }),
    (formData) => {
        const data = Object.fromEntries(formData.entries());
        if(!addAccount(data.code, data.name, data.kind, (data.amount || 0))) return;
        renderLedgerState();
    }
));

doManualJournalEntryBtn.addEventListener("click", _ => doForm(
    "Manual Journal Entry",
    el$("form").body$(form => {
        form.add$(el$("h2").add$("Manual Journal"));
        form.add$(el$("div").add$(
            el$("label").att$("for", "description").add$("Description: "),
            el$("input")
                .att$("id", "description")
                .att$("type", "text")
                .att$("name", "description")
                .att$("placeholder", "What is this for?"),
        ));
        /** @type {HTMLElement} */
        const entries = el$("ol")
        const addEntry = _ => {
            const entry = el$("li").add$(
                el$("select").att$("name", "account").body$(
                    (selection) => {
                        for(const account of currentLedger.chartOfAccounts) {
                            selection.add$(el$("option")
                                .att$("value", account.code)
                                .add$(`${account.code} - ${account.name}`))
                        }
                    }
                ),
                " - ",
                el$("select").att$("name", "side").add$(
                    el$("option").att$("value", "D").add$("Debit"),
                    el$("option").att$("value", "C").add$("Credit"),
                ),
                " - ",
                el$("input").att$("type", "text").att$("name", "currency")
                    .att$("placeholder", "Currency (e.g. IDR)")
                    .att$("value", "IDR"),
                " - ",
                el$("input").att$("type", "number").att$("name", "amount").att$("placeholder", "e.g. 10000"),
                " - ",
                el$("button").att$("type", "button").add$("Remove").onclick$(_ => {
                    entries.removeChild(entry);
                })
            )
            entries.add$(entry)
        }
        addEntry()
        addEntry()
        form.add$(entries)
        form.add$(el$("p").add$(
            el$("button").att$("type", "submit").add$("Submit"),
            " - ",
            el$("button").att$("type", "button").add$("Add Line").onclick$(addEntry),
        ))
    }),
    (formData) => {
        const description = formData.get("description")
        const accounts = formData.getAll("account");
        const sides = formData.getAll("side");
        const currencies = formData.getAll("currency");
        const amounts = formData.getAll("amount");

        const entries = []
        for (let i = 0; i < accounts.length; i++) {
            entries.push([
                accounts[i],
                sides[i],
                currencies[i],
                amounts[i],
            ]);
        }
        addTx(description, entries);
        renderLedgerState();
    },
))

createNewTransactionTemplateBtn.addEventListener("click", _ => doForm(
    "New Transaction Template Creation",
    el$("form").body$(form => {
        form.add$(el$("h2").add$("Create New Transaction Template"))
        form.add$(el$("div").add$(
            el$("label").att$("for", "title").add$("Template Title: "),
            el$("input")
                .att$("id", "title")
                .att$("type", "text")
                .att$("name", "title")
                .att$("placeholder", "e.g. Salary Income")
        ));
        const fields = el$("ol")
        form.add$(fields);
        const addField = _ => {
            const field = el$("li").add$(
                el$("input").att$("type", "text").att$("name", "fieldLabel")
                    .att$("placeholder", "Field Label (e.g. Cost)"),
                " - ",
            )
            /** @type {HTMLSelectElement} */
            const select = el$("select").att$("name", "fieldAction").add$(
                el$("option").att$("value", "VOID").add$("None"),
                el$("option").att$("value", "DC").add$("Debit & Credit"),
                el$("option").att$("value", "DO").add$("Debit Only"),
                el$("option").att$("value", "CO").add$("Credit Only"),
            );
            const action = el$("span").add$("No Action");
            select.onchange = ev => {
                const value = ev.target.value 
                action.innerHTML = ""
                switch(value) {
                case "VOID":
                    {
                        action.add$(
                            // stub value
                            el$("input").atts$({ type: "hidden", name: "fieldActionDebitInto",  value: "" }),
                            el$("input").atts$({ type: "hidden", name: "fieldActionCreditInto", value: "" }),
                        )
                        action.add$("No Action");
                    } break;
                case "DO":
                    {
                        action.add$(
                            // stub value
                            el$("input").atts$({ type: "hidden", name: "fieldActionCreditInto",  value: "" }),
                        )
                        action.add$(el$("select").att$("name", "fieldActionDebitDebitInto").body$(
                            (selection) => {
                                for(const account of currentLedger.chartOfAccounts) {
                                    selection.add$(el$("option")
                                        .att$("value", account.code)
                                        .add$(`${account.code} - ${account.name}`))
                                }
                            }
                        ))
                    } break;
                case "CO":
                    {
                        action.add$(
                            // stub value
                            el$("input").atts$({ type: "hidden", name: "fieldActionDebitInto",  value: "" }),
                        )
                        action.add$(el$("select").att$("name", "fieldActionCreditInto").body$(
                            (selection) => {
                                for(const account of currentLedger.chartOfAccounts) {
                                    selection.add$(el$("option")
                                        .att$("value", account.code)
                                        .add$(`${account.code} - ${account.name}`))
                                }
                            }
                        ))
                    } break;
                case "DC":
                    {
                        action.add$(el$("select").att$("name", "fieldActionDebitInto").body$(
                            (selection) => {
                                for(const account of currentLedger.chartOfAccounts) {
                                    selection.add$(el$("option")
                                        .att$("value", account.code)
                                        .add$(`${account.code} - ${account.name}`))
                                }
                            }
                        ))
                        action.add$(el$("select").att$("name", "fieldActionCreditInto").body$(
                            (selection) => {
                                for(const account of currentLedger.chartOfAccounts) {
                                    selection.add$(el$("option")
                                        .att$("value", account.code)
                                        .add$(`${account.code} - ${account.name}`))
                                }
                            }
                        ))
                    } break;
                }
            }
            field.add$(
                select,
                " - ",
                action,
                " - ",
                el$("button").att$("type", "button").add$("Remove").onclick$(_ => {
                    fields.removeChild(field);
                })
            )
            fields.add$(field)
        }
        form.add$(el$("p").add$(
            el$("button").att$("type", "submit").add$("Submit"),
            " - ",
            el$("button").att$("type", "button").add$("Add Field").onclick$(addField),
        ))
    }),
    formData => {
        const title  = formData.get("title")
        const fieldLabel  = formData.getAll("fieldLabel");
        const fieldAction = formData.getAll("fieldAction");
        const fieldActionDebitInto = formData.getAll("fieldActionDebitInto")
        const fieldActionCreditInto = formData.getAll("fieldActionCreditInto")
        const fields = {}
        for(let i = 0; i < fieldLabel.length; ++i) {
            const label  = fieldLabel[i];
            const action = fieldAction[i];
            switch(action) {
                case "VOID":
                    break;
                case "DC":
                    fields[label] = `number|debit:${fieldActionDebitInto[i]}|credit:${fieldActionCreditInto[i]}`
                    break;
                case "DO":
                    fields[label] = `number|debit:${fieldActionDebitInto[i]}`
                    break;
                case "CO":
                    fields[label] = `number|credit:${fieldActionCreditInto[i]}`
                    break;
            }
        }
        if(!addTemplate(title, fields)) return;
        renderLedgerState();
    }
));

doTransactionBtn.addEventListener("click", _ => doForm(
    "Transaction",
    el$("form").body$(form => {
        const select = el$("select").atts$({ id: "txForm", name: "txForm" }).body$(select => {
            let i = 0;
            for(const tt of currentLedger.transactionTemplates) {
                select.add$(el$("option").att$("value", i).add$(tt.title))
                i += 1;
            }
        });

        const fields = el$("div")
        const renderTemplate = index => {
            fields.innerHTML = "";
            const template = currentLedger.transactionTemplates[index];
            for (const [name, txField] of Object.entries(template.form)) {
                fields.add$(el$("div").add$(
                    el$("label").att$("for", `field-${name}`).add$(`${name} (${txField}): `),
                    el$("input").atts$({ required: true, id: `field-${name}`, type: "number", name }),
                ))
            }
        }

        renderTemplate(0);
        select.onchange = ev => renderTemplate(parseInt(ev.target.value))

        form.add$(
            el$("h2").add$("Transaction"),
            el$("div").add$(
                el$("label").att$("for", "txDescription").add$("Description (optional): "),
                el$("input").atts$({ id: "txDescription", type: "text", name: "txDescription" }),
            ),
            el$("div").add$(
                el$("label").att$("for", "txForm").add$("Template: "),
                select,
            ),
            fields,
            el$("p").add$(
                el$("button").att$("type", "submit").add$("Submit"),
            ),
        )
    }),
    formData => {
        const txFormIndex = parseInt(formData.get("txForm"));
        if(Number.isNaN(txFormIndex)) {
            showError(`Something went wrong we could not execute your transaction`);
            return;
        }
        const txForm = currentLedger.transactionTemplates[txFormIndex];
        const txFormValues = {}
        for(const [fieldName, _] of Object.entries(txForm.form)) {
            if(!formData.has(fieldName)) {
                showError(`Something went wrong we could not execute your transaction`);
                return;
            }
            const fieldValue = formData.get(fieldName);
            if(!fieldValue) {
                showError(`Please submit a correct value for field ${fieldName} in the form ${txForm.title}`);
                return;
            }
            txFormValues[fieldName] = fieldValue;
        }
        if(!addTxViaForm(txFormIndex, txFormValues, formData.get("description"))) return;
        renderLedgerState();
    }
));

saveLedgerBtn.addEventListener("click", _ => {
    if(!downloadLedgerAsFile()) return;
});

///
/// Home Screen
///

createNewLedgerBtn.addEventListener("click", ev => {
    if(hasAnyLedgerOpen()) {
        showError("Could not create another ledger you need to close it first");
        return;
    }
    if(!openLedger(createNewBasicLedger())) {
        return;
    }
});

submitLedgerBtn.addEventListener("click", ev => {
    if(hasAnyLedgerOpen()) return showError("Could not open another ledger you need to close it first");
    const file = importLedgerFileInput.files[0];
    if(!file) return showError("Please select a valid ledger");
    const reader = new FileReader();
    reader.onload = (event) => {
        let parsed;
        try {
            parsed = JSON.parse(event.target.result);
        } catch (err) {
            return showError("That file isn't valid JSON, so it can't be read as a ledger.");
        }
        if(!openLedger(parsed)) return;
    };
    reader.onerror = () => showError("Couldn't read that file. Please try again.");
    reader.readAsText(file);
});

function createNewBasicLedger() {
    const ledger = {
        chartOfAccounts: [
            {
                code: "A-1",
                name: "Cash",
                kind: "ASSET",
                amount: 0,
            },
            {
                code: "L-1",
                name: "Short Term Payables",
                kind: "LIABILITY",
                amount: 0,
            },
            {
                code: "L-2",
                name: "Long Term Payables",
                kind: "LIABILITY",
                amount: 0,
            },
            {
                code: "E-1",
                name: "Capital",
                kind: "EQUITY",
                amount: 0,
            },
            {
                code: "E-2",
                name: "Retained Earnings",
                kind: "EQUITY",
                amount: 0,
            },
            {
                code: "R-1",
                name: "Other Revenues",
                kind: "REVENUE",
                amount: 0,
            },
            {
                code: "R-2",
                name: "Salary Revenue",
                kind: "REVENUE",
                amount: 0,
            },
            {
                code: "X-1",
                name: "Other Expenses",
                kind: "EXPENSE",
                amount: 0,
            }
        ],
        // TODO: rename this into forms
        transactionTemplates: [
            {
                "title": "Food Fee",
                // TODO: rename this into fields
                "form": {
                    "Cost": "number|debit:X-1|credit:A-1",
                }
            },
            {
                "title": "Salary",
                "form": {
                    "Salary": "number|debit:A-1|credit:R-2",
                }
            }
        ],
        lastTransactionAggregation: 0,
        lastTransactionRecord: 0,
        transactions: [
            {
                "E": [ 
                    [ "A-1", "D", "IDR", 10000000 ],
                    [ "R-1", "C", "IDR", 10000000 ],
                ],
                "D": "Finally my revenue LOL",
                "T": "2026-09-25 09:00:00",
            },
            {
                "E": [ 
                    [ "X-1", "D", "IDR", 100000 ],
                    [ "A-1", "C", "IDR", 100000 ],
                ],
                "D": "KFC",
                "T": "2026-09-25 17:00:00",
            }
        ],
    }

    return ledger;
}
