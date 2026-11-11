// Skill library view for MCP Apps hosts: skill cards and proposed-change
// diffs. Every button calls one of the server's own tools, which the model can
// call too. Data arrives in the tool result's _meta["skill-library/view"].
(function () {
  "use strict";

  var DATA_KEY = "skill-library/view";
  /** Cards shown before "Show more": a 2x2 grid in Claude. */
  var FIRST_SHOWN = 4;
  var root = document.getElementById("root");
  var callTool = skillHost.callTool;
  var openLink = skillHost.openLink;
  var sendMessage = skillHost.sendMessage;

  // --- DOM helpers -------------------------------------------------------

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      var value = attrs[key];
      if (value === undefined || value === null || value === false) return;
      if (key === "text") node.textContent = value;
      else if (key === "onclick") node.addEventListener("click", value);
      else node.setAttribute(key, value === true ? "" : value);
    });
    (children || []).forEach(function (child) {
      if (child)
        node.appendChild(
          typeof child === "string" ? document.createTextNode(child) : child
        );
    });
    return node;
  }

  function setStatus(text) {
    root.replaceChildren(el("p", { class: "muted", text: text }));
  }

  function resultText(result) {
    return ((result && result.content) || [])
      .map(function (item) {
        return item.text || "";
      })
      .join("\n");
  }

  function viewData(result) {
    return result && result._meta && result._meta[DATA_KEY];
  }

  function plural(count, word) {
    return count + " " + word + (count === 1 ? "" : "s");
  }

  /** Runs a tool from a button, keeping the button busy until it answers. */
  function run(button, note, name, args) {
    button.disabled = true;
    note.className = "note";
    note.textContent = "";
    return callTool(name, args)
      .then(function (result) {
        if (result && result.isError) throw new Error(resultText(result));
        return result;
      })
      .catch(function (error) {
        note.className = "note bad";
        note.textContent = error.message || String(error);
        throw error;
      })
      .finally(function () {
        button.disabled = false;
      });
  }

  // --- Rendering ---------------------------------------------------------

  function showResult(result) {
    var data = viewData(result);
    if (result && result.isError) return setStatus(resultText(result));
    if (!data) return setStatus(resultText(result) || "Nothing to show.");
    if (data.kind === "catalog") return renderCatalog(data);
    if (data.kind === "proposals") return renderProposals(data);
    setStatus(resultText(result));
  }

  function renderCatalog(data) {
    if (!data.skills.length) return setStatus("No skills to show.");
    var shown =
      data.skills.length < data.total
        ? "Showing " + data.skills.length + " of " + data.total
        : plural(data.total, "skill");
    // The skills arrive best first; show a few so the view doesn't push
    // Claude's answer off screen, and the rest on request.
    var grid = el(
      "div",
      { class: "grid" },
      data.skills.slice(0, FIRST_SHOWN).map(skillCard)
    );
    var rest = data.skills.slice(FIRST_SHOWN);
    var more = rest.length
      ? el("button", {
          type: "button",
          class: "link more",
          text: "Show " + rest.length + " more",
          onclick: function () {
            grid.append.apply(grid, rest.map(skillCard));
            more.remove();
          },
        })
      : null;
    root.replaceChildren(
      el("h2", { text: data.title }, [
        el("span", { class: "muted small", text: " · " + shown }),
      ]),
      grid,
      more
    );
  }

  function skillCard(skill) {
    var note = el("div", { class: "note", role: "status" });
    var stats = el("div", { class: "stats" });
    var panel = el("div");
    var vote = el("button", { type: "button" });

    function paintStats() {
      stats.textContent = [
        skill.colleagues
          ? "Used by " + plural(skill.colleagues, "colleague")
          : "Not installed yet",
        plural(skill.upvotes, "upvote"),
      ].join(" · ");
      vote.textContent = skill.upvotedByMe ? "▲ Upvoted" : "▲ Upvote";
      vote.className = skill.upvotedByMe ? "on" : "";
      vote.setAttribute("aria-pressed", String(!!skill.upvotedByMe));
    }

    vote.addEventListener("click", function () {
      run(vote, note, "skills_vote", {
        skill: skill.slug,
        useful: !skill.upvotedByMe,
      }).then(function (result) {
        var data = viewData(result);
        if (data) {
          skill.upvotes = data.upvotes;
          skill.colleagues = data.colleagues;
          skill.upvotedByMe = data.upvotedByMe;
        }
        paintStats();
      });
    });
    if (skill.mine) {
      vote.disabled = true;
      vote.title = "You can't upvote your own skill";
    }

    var use = el("button", {
      type: "button",
      class: "primary",
      text: "Use now",
    });
    if (!skillHost.capabilities().message) {
      use.disabled = true;
      use.title = "Ask Claude to use " + skill.slug;
    }
    use.addEventListener("click", function () {
      use.disabled = true;
      sendMessage(
        'Use the "' +
          skill.name +
          '" skill (' +
          skill.slug +
          ") from the skill library for this conversation."
      )
        .then(function (answer) {
          if (answer && answer.isError)
            throw new Error("Claude did not take the message.");
          note.className = "note ok";
          note.textContent = "Asked Claude to use it.";
        })
        .catch(function (error) {
          use.disabled = false;
          note.className = "note bad";
          note.textContent = error.message || String(error);
        });
    });

    var install = el("button", { type: "button", text: "Install" });
    install.addEventListener("click", function () {
      run(install, note, "skills_install", {
        skill: skill.slug,
        client: "claude-app",
      }).then(function (result) {
        var data = viewData(result);
        panel.replaceChildren(installPanel(data, result));
      });
    });

    var badge =
      skill.status && skill.status !== "approved"
        ? el("span", { class: "badge warn", text: skill.status })
        : null;

    paintStats();
    return el("article", { class: "card" }, [
      el("div", { class: "head" }, [el("h3", { text: skill.name }), badge]),
      el("div", {
        class: "muted small",
        text: [
          skill.author && "by " + skill.author,
          skill.version && "v" + skill.version,
        ]
          .filter(Boolean)
          .join(" · "),
      }),
      el("p", {
        class: "desc",
        text: skill.description,
        title: skill.description,
      }),
      skill.categories && skill.categories.length
        ? el(
            "div",
            { class: "chips" },
            skill.categories.map(function (c) {
              return el("span", { class: "chip", text: c });
            })
          )
        : null,
      stats,
      el("div", { class: "actions" }, [
        use,
        install,
        vote,
        el("button", {
          type: "button",
          class: "link",
          text: "Open page",
          onclick: function () {
            openLink(skill.url);
          },
        }),
      ]),
      panel,
      note,
    ]);
  }

  function installPanel(data, result) {
    if (!data) return el("div", { class: "panel", text: resultText(result) });
    return el("div", { class: "panel" }, [
      el("button", {
        type: "button",
        class: "primary",
        text: "Download " + data.name,
        onclick: function () {
          openLink(data.downloadUrl);
        },
      }),
      el("ol", {}, [
        el("li", { text: "In Claude, open Customize, then Skills." }),
        el("li", {
          text: "Click +, then Create skill, then Upload a skill, and pick the downloaded file.",
        }),
        el("li", { text: "Turn the skill on with its switch." }),
      ]),
    ]);
  }

  function renderProposals(data) {
    var parts = [];
    parts.push(
      el("h2", {
        text: data.forMe.length
          ? "Changes waiting for your decision"
          : "Nothing waits for your decision",
      })
    );
    if (data.forMe.length)
      parts.push(el("div", { class: "list" }, data.forMe.map(proposalCard)));
    if (data.fromMe.length) {
      parts.push(
        el("div", { class: "section" }, [
          el("h2", { text: "Changes you proposed" }),
          el(
            "div",
            { class: "list" },
            data.fromMe.map(function (p) {
              return el("div", { class: "card" }, [
                el("h3", { text: p.name + " " + p.version }),
                el("div", {
                  class: "muted small",
                  text:
                    "Waiting for " +
                    (p.owner || "the owner") +
                    " since " +
                    p.createdAt.slice(0, 10),
                }),
              ]);
            })
          ),
        ])
      );
    }
    root.replaceChildren.apply(root, parts);
  }

  function proposalCard(p) {
    var note = el("div", { class: "note", role: "status" });
    var actions = el("div", { class: "actions" });

    function decide(decision, button) {
      if (button.dataset.armed !== "yes") {
        button.dataset.armed = "yes";
        button.textContent =
          decision === "approve" ? "Confirm approve" : "Confirm reject";
        return;
      }
      run(button, note, "skills_review_proposal", {
        skill: p.slug,
        version: p.version,
        decision: decision,
      }).then(function (result) {
        actions.replaceChildren(
          el("span", {
            class: "badge " + (decision === "approve" ? "ok" : "warn"),
            text: decision === "approve" ? "Approved" : "Rejected",
          })
        );
        note.className = "note";
        note.textContent = resultText(result);
      });
    }

    var approve = el("button", {
      type: "button",
      class: "primary",
      text: "Approve",
    });
    approve.addEventListener("click", function () {
      decide("approve", approve);
    });
    var reject = el("button", {
      type: "button",
      class: "danger",
      text: "Reject",
    });
    reject.addEventListener("click", function () {
      decide("reject", reject);
    });
    actions.append(
      approve,
      reject,
      el("button", {
        type: "button",
        class: "link",
        text: "Open page",
        onclick: function () {
          openLink(p.url);
        },
      })
    );

    return el("article", { class: "card" }, [
      el("div", { class: "head" }, [
        el("h3", { text: p.name + " " + p.version }),
        p.valid
          ? null
          : el("span", {
              class: "badge warn",
              text: "Has validation problems",
            }),
      ]),
      el("div", {
        class: "muted small",
        text:
          "Proposed by " +
          (p.author || "a colleague") +
          " on " +
          p.createdAt.slice(0, 10) +
          (p.currentVersion
            ? ", replaces " + p.currentVersion
            : ", first version"),
      }),
      p.files
        ? diffList(p.files)
        : el("div", {
            class: "muted small",
            text: "Ask Claude to show the changes.",
          }),
      actions,
      note,
    ]);
  }

  function diffList(files) {
    if (!files.length)
      return el("div", { class: "muted small", text: "No file changes." });
    return el(
      "div",
      { class: "list" },
      files.map(function (file, index) {
        var body;
        if (file.binary)
          body = el("div", { class: "diff" }, [
            el("div", { class: "gap", text: "Binary file " + file.status }),
          ]);
        else if (file.lineEndingsOnly)
          body = el("div", { class: "diff" }, [
            el("div", {
              class: "gap",
              text: "Only line endings or the final newline changed",
            }),
          ]);
        else if (file.tooLarge)
          body = el("div", { class: "diff" }, [
            el("div", {
              class: "gap",
              text: "Too long to show; " + file.status,
            }),
          ]);
        else {
          var rows = [];
          file.hunks.forEach(function (hunk, i) {
            if (i > 0) rows.push(el("div", { class: "gap", text: "…" }));
            hunk.forEach(function (line) {
              rows.push(
                el("div", {
                  class: line.op === "+" ? "add" : line.op === "-" ? "del" : "",
                  text: line.op + " " + line.text,
                })
              );
            });
          });
          body = el("div", { class: "diff" }, rows);
        }
        return el("details", { open: index === 0 }, [
          el("summary", { text: file.path + " (" + file.status + ")" }),
          body,
        ]);
      })
    );
  }

  skillHost.onResult = showResult;
  skillHost.onCancelled = function () {
    setStatus("The tool call was cancelled.");
  };
  skillHost.onUnsupported = function () {
    setStatus("This view needs a host that supports MCP Apps.");
  };
})();
