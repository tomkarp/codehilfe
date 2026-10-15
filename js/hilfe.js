/* ============================================================
 * Hilfe – ergänzt jedes Beispiel (.beispiel) um "Im Editor öffnen".
 *
 * Läuft vor dem Aufbau der CodeHilfen (die erst an DOMContentLoaded
 * starten) und liest deshalb noch das ursprüngliche pre-Element.
 * ============================================================ */
(function () {
	"use strict";

	/* Inline-Inhalt eines Absatzes in die Auszeichnung des Editors */
	function inline(knoten) {
		var text = "";
		Array.prototype.forEach.call(knoten.childNodes, function (kind) {
			if (kind.nodeType === Node.TEXT_NODE) {
				text += kind.textContent;
			} else if (kind.nodeName === "CODE") {
				text += "`" + kind.textContent + "`";
			} else if (kind.nodeName === "STRONG" || kind.nodeName === "B") {
				text += "**" + kind.textContent + "**";
			} else {
				text += inline(kind);
			}
		});
		return text;
	}

	function alsAufgabentext(stellung) {
		if (!stellung) {
			return "";
		}
		var teile = [];
		Array.prototype.forEach.call(stellung.children, function (kind) {
			if (kind.nodeName === "PRE") {
				teile.push("```\n" + kind.textContent.replace(/^\n/, "")
					.replace(/\s+$/, "") + "\n```");
			} else if (kind.nodeName === "UL" || kind.nodeName === "OL") {
				var zeichen = kind.nodeName === "UL" ? "- " : "1. ";
				teile.push(Array.prototype.map.call(kind.children, function (li) {
					return zeichen + inline(li).replace(/\s+/g, " ").trim();
				}).join("\n"));
			} else {
				teile.push(inline(kind).replace(/\s+/g, " ").trim());
			}
		});
		return teile.join("\n\n");
	}

	function datenAus(beispiel) {
		var pre = beispiel.querySelector("pre.codehilfe");
		var code = pre.querySelector("code");
		var sprache = "";
		Array.prototype.some.call(code.classList, function (klasse) {
			if (klasse.indexOf("language-") === 0) {
				sprache = klasse.slice("language-".length);
				return true;
			}
			return false;
		});
		var ueberschrift = beispiel.querySelector("h3.aufgabe");
		return CodeHilfeTeilen.bereinige({
			titel: ueberschrift ? ueberschrift.textContent.trim()
				: (beispiel.getAttribute("data-titel") || ""),
			aufgabe: alsAufgabentext(beispiel.querySelector(".aufgabenstellung")),
			sprache: sprache,
			zeilenSortieren: pre.hasAttribute("data-zeilen-sortieren"),
			zeilenVerschieben: pre.getAttribute("data-zeilen-verschieben") || "ueberall",
			lueckenEingabe: pre.getAttribute("data-luecken-eingabe") || "tippen",
			loesung: pre.getAttribute("data-loesung") || "nie",
			code: code.textContent.replace(/^\n/, "").replace(/\s+$/, "")
		});
	}

	Array.prototype.forEach.call(document.querySelectorAll(".beispiel"), function (beispiel) {
		if (!beispiel.querySelector("pre.codehilfe")) {
			return;
		}
		var daten = datenAus(beispiel);
		var aktionen = document.createElement("div");
		aktionen.className = "beispiel-aktionen";
		var link = document.createElement("a");
		link.className = "knopf knopf-klein";
		link.href = "index.html";
		link.textContent = "Im Editor öffnen";
		aktionen.appendChild(link);
		beispiel.appendChild(aktionen);

		CodeHilfeTeilen.kodiere(daten, { bearbeitbar: true }).then(function (kodiert) {
			link.href = CodeHilfeTeilen.link("index.html", kodiert);
		}).catch(function () {
			aktionen.remove();
		});
	});
})();
