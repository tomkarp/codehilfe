/* ============================================================
 * Teilen – eine CodeHilfe-Aufgabe vollständig im Link speichern.
 *
 * Format des Linkanteils hinter "#":
 *
 *   v1.<base64url(deflate-raw(JSON))>
 *
 * Der Teil hinter "#" wird vom Browser nie an den Server geschickt.
 * Die Aufgabe liegt also nirgends gespeichert, sondern nur im Link.
 *
 * Bearbeitungslinks enthalten im JSON zusätzlich "bearbeitbar": true.
 * Der Editor öffnet nur solche Links. So genügt es nicht, in einem
 * Schülerlink aufgabe.html durch index.html zu ersetzen. Wer den Link
 * entpackt, kommt trotzdem an alles heran – ein Schutz ist das nicht.
 * ============================================================ */
(function () {
	"use strict";

	var PRAEFIX = "v1.";

	var STANDARD = {
		titel: "",
		aufgabe: "",
		sprache: "python",
		zeilenSortieren: false,
		zeilenVerschieben: "ueberall",
		lueckenEingabe: "tippen",
		loesung: "nie",
		code: ""
	};

	function kannKomprimieren() {
		return typeof CompressionStream === "function" &&
			typeof DecompressionStream === "function";
	}

	function zuBase64url(bytes) {
		var binaer = "";
		for (var i = 0; i < bytes.length; i++) {
			binaer += String.fromCharCode(bytes[i]);
		}
		return btoa(binaer)
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/, "");
	}

	function ausBase64url(text) {
		var base64 = text.replace(/-/g, "+").replace(/_/g, "/");
		while (base64.length % 4) {
			base64 += "=";
		}
		var binaer = atob(base64);
		var bytes = new Uint8Array(binaer.length);
		for (var i = 0; i < binaer.length; i++) {
			bytes[i] = binaer.charCodeAt(i);
		}
		return bytes;
	}

	function komprimiere(text) {
		var strom = new Blob([text]).stream()
			.pipeThrough(new CompressionStream("deflate-raw"));
		return new Response(strom).arrayBuffer().then(function (puffer) {
			return new Uint8Array(puffer);
		});
	}

	function entpacke(bytes) {
		var strom = new Blob([bytes]).stream()
			.pipeThrough(new DecompressionStream("deflate-raw"));
		return new Response(strom).text();
	}

	/* Fremde oder beschädigte Daten auf bekannte Felder und Typen
	 * zurückführen. Werte für die CodeHilfe-Einstellungen bleiben Text,
	 * damit die CodeHilfe unbekannte Werte selbst als Fehler meldet. */
	function bereinige(roh) {
		var daten = {};
		roh = roh && typeof roh === "object" ? roh : {};
		Object.keys(STANDARD).forEach(function (schluessel) {
			var wert = roh[schluessel];
			var standard = STANDARD[schluessel];
			if (typeof standard === "boolean") {
				daten[schluessel] = wert === true;
			} else {
				daten[schluessel] = typeof wert === "string" ? wert : standard;
			}
		});
		/* Die Sprache landet als Klassenname language-… am code-Element. */
		if (!/^[a-z0-9-]*$/.test(daten.sprache)) {
			daten.sprache = "";
		}
		return daten;
	}

	/* optionen.bearbeitbar: true erzeugt den Inhalt eines Bearbeitungslinks */
	function kodiere(daten, optionen) {
		if (!kannKomprimieren()) {
			return Promise.reject(new Error(
				"Dieser Browser kann keine Links erzeugen. Bitte aktualisiere ihn."));
		}
		var inhalt = bereinige(daten);
		if (optionen && optionen.bearbeitbar) {
			inhalt.bearbeitbar = true;
		}
		return komprimiere(JSON.stringify(inhalt)).then(function (bytes) {
			return PRAEFIX + zuBase64url(bytes);
		});
	}

	/* Liefert { daten, bearbeitbar } */
	function dekodiere(fragment) {
		var text = (fragment || "").replace(/^#/, "").trim();
		if (text.indexOf(PRAEFIX) !== 0) {
			return Promise.reject(new Error(
				"Der Link enthält keine CodeHilfe-Aufgabe."));
		}
		if (!kannKomprimieren()) {
			return Promise.reject(new Error(
				"Dieser Browser kann die Aufgabe nicht öffnen. Bitte aktualisiere ihn."));
		}
		var bytes;
		try {
			bytes = ausBase64url(text.slice(PRAEFIX.length));
		} catch (fehler) {
			return Promise.reject(new Error(
				"Der Link ist unvollständig oder beschädigt."));
		}
		return entpacke(bytes).then(function (json) {
			var roh = JSON.parse(json);
			return {
				daten: bereinige(roh),
				bearbeitbar: !!roh && roh.bearbeitbar === true
			};
		}).catch(function () {
			throw new Error("Der Link ist unvollständig oder beschädigt.");
		});
	}

	/* Absoluter Link zu einer Seite dieses Werkzeugs, z.B. aufgabe.html */
	function link(seite, kodiert, parameter) {
		var url = new URL(seite, window.location.href);
		url.search = parameter || "";
		url.hash = kodiert;
		return url.href;
	}

	window.CodeHilfeTeilen = {
		standard: function () {
			return bereinige({});
		},
		bereinige: bereinige,
		kodiere: kodiere,
		dekodiere: dekodiere,
		link: link,
		kannKomprimieren: kannKomprimieren
	};
})();
