/* ============================================================
 * Aufgabenseite – zeigt die Aufgabe aus dem Link (aufgabe.html#v1.…).
 * Mit ?einbetten erscheint nur die Aufgabe, z.B. in einem iframe.
 * ============================================================ */
(function () {
	"use strict";

	var ziel = document.getElementById("aufgabe");
	var hinweis = document.getElementById("hinweis");

	if (new URLSearchParams(window.location.search).has("einbetten")) {
		document.body.classList.add("eingebettet");
	}

	function zeigeHinweis(text) {
		ziel.textContent = "";
		hinweis.hidden = false;
		hinweis.querySelector(".hinweis-text").textContent = text;
		document.title = "Aufgabe";
	}

	function lade() {
		if (!window.location.hash || window.location.hash === "#") {
			zeigeHinweis("Dieser Link enthält keine Aufgabe. Öffne den " +
				"vollständigen Link, den du von deiner Lehrkraft bekommen hast.");
			return;
		}
		CodeHilfeTeilen.dekodiere(window.location.hash).then(function (ergebnis) {
			var daten = ergebnis.daten;
			hinweis.hidden = true;
			CodeHilfeAufgabe.zeige(ziel, daten);
			document.title = daten.titel.trim() || "Aufgabe";
		}).catch(function (fehler) {
			zeigeHinweis(fehler.message + " Prüfe, ob der Link vollständig " +
				"kopiert wurde.");
		});
	}

	window.addEventListener("hashchange", lade);
	lade();
})();
