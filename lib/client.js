window.__ModuleLoader__.load({
	id: "@lvxianchao/dsh-video-preview",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const React = require("react");
		const h = React.createElement;

		//#region contract
		/**
		 * Dictionary namespace owned by this plugin. The document-body slot binds
		 * `props.t` to it, and the chip title comes from the same dictionary.
		 */
		const NS = "sidebarVideo";

		/**
		 * Renderer implementation id. Doubles as the keyed
		 * `sidebar.right.tab.document` slot key, which is how the preview frame
		 * finds this body.
		 */
		const VIDEO_BODY_ID = "@lvxianchao/dsh-video-preview/video";

		/**
		 * Suffixes this renderer claims. Only containers a browser can routinely
		 * decode are listed: claiming `.mkv` would trade "no preview" for a broken
		 * player, because Chrome cannot decode Matroska video.
		 */
		const VIDEO_EXTENSIONS = ["mp4", "m4v", "webm", "ogv", "ogg", "mov"];

		/** Suffix to the media type of the stream route. */
		const MEDIA_TYPES = {
			mp4: "video/mp4",
			m4v: "video/mp4",
			webm: "video/webm",
			ogv: "video/ogg",
			ogg: "video/ogg",
			mov: "video/quicktime"
		};

		/**
		 * Host routes this renderer streams from. Registered by the plugin's host
		 * half on Connection's authenticated fetch fence. The client-side forms
		 * are document-relative (leading slash stripped) so they keep working
		 * under a deployment prefix.
		 */
		const STREAM_PATH = "/api/video-preview.stream";
		const STAT_PATH = "/api/video-preview.stat";
		const STREAM_ROUTE = STREAM_PATH.slice(1);
		const STAT_ROUTE = STAT_PATH.slice(1);

		/** Address prefix shared by the harness file-reference format. */
		const FILE_ADDRESS_PREFIX = "dsh-resource://file/";

		/** Localized copy for the body, the loading line, and the chip title. */
		const zh = {
			title: "视频",
			loading: "视频读取中…",
			failed: "无法为这个视频创建播放器。",
			broken: "浏览器无法解码这个视频：编码或封装可能不受支持。",
			mutedHint: "静音自动播放 · 在播放器控制条里可开启声音",
			metaFormat: "格式"
		};

		/** Source-of-truth dictionary; English follows the same key set. */
		const en = {
			title: "Video",
			loading: "Loading video…",
			failed: "Could not create a player for this video.",
			broken: "The browser cannot decode this video: its codec or container is unsupported.",
			mutedHint: "Playing muted · unmute in the player controls for sound",
			metaFormat: "Format"
		};

		/** Filename without its directory, for the meta line. */
		function displayName(address) {
			const raw = String(address ?? "");
			const tail = raw.slice(Math.max(raw.lastIndexOf("/"), raw.lastIndexOf("\\")) + 1);
			let decoded = tail;
			try {
				decoded = decodeURIComponent(tail);
			} catch {
				decoded = tail;
			}
			return decoded === "" ? "video" : decoded;
		}

		/** Lowercase suffix of a path or file address, without the dot. */
		function suffixOf(address) {
			const name = displayName(address);
			const cut = name.lastIndexOf(".");
			return cut < 0 ? "" : name.slice(cut + 1).toLowerCase();
		}

		/** Media type for a registered video suffix, if any. */
		function mediaTypeOf(address) {
			return MEDIA_TYPES[suffixOf(address)];
		}

		/**
		 * Parse a session-scoped file address into its coordinates.
		 * @returns `{sessionId, path}` or undefined for any other scope or shape.
		 */
		function fileAddressOf(address) {
			if (typeof address !== "string" || !address.startsWith(FILE_ADDRESS_PREFIX)) return undefined;
			const end = address.search(/[?#]/);
			const parts = address.slice(FILE_ADDRESS_PREFIX.length, end === -1 ? undefined : end).split("/");
			if (parts[0] !== "session") return undefined;
			const id = parts[1];
			const segments = parts.slice(2);
			if (id === undefined || id === "" || segments.length === 0) return undefined;
			try {
				return { sessionId: decodeURIComponent(id), path: segments.map(decodeURIComponent).join("/") };
			} catch {
				return undefined;
			}
		}

		/** Human-readable byte count. */
		function sizeText(bytes) {
			if (typeof bytes !== "number" || bytes < 0) return "";
			if (bytes < 1024) return `${bytes} B`;
			if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
			return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
		}

		/**
		 * Describe the builtin image-style metadata for video files. Priority
		 * `extension` marks this as an external renderer: it outranks product
		 * implementations for the same suffix and can be replaced the same way.
		 * Loading is `renderer`: this body owns its loading, so no complete-byte
		 * read (and no complete-file size cap) ever runs for a video.
		 */
		function videoBodyDefinition(translate) {
			return {
				id: VIDEO_BODY_ID,
				extensions: VIDEO_EXTENSIONS,
				binaryExtensions: VIDEO_EXTENSIONS,
				priority: "extension",
				title: () => translate("title"),
				loading: "renderer",
				wrap: false
			};
		}

		const styles = {
			frame: {
				boxSizing: "border-box",
				width: "100%",
				height: "100%",
				padding: "12px",
				display: "flex",
				flexDirection: "column",
				gap: "10px",
				alignItems: "stretch",
				overflow: "auto"
			},
			video: {
				display: "block",
				width: "100%",
				maxWidth: "100%",
				maxHeight: "70vh",
				margin: "0 auto",
				background: "#000",
				borderRadius: "10px",
				outline: "none"
			},
			meta: {
				display: "flex",
				alignItems: "baseline",
				justifyContent: "space-between",
				gap: "12px",
				padding: "0 2px",
				font: "400 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace",
				color: "var(--dsw-alias-text-3, #8b929c)"
			},
			name: {
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap"
			},
			detail: {
				flex: "none",
				opacity: 0.85
			},
			hint: {
				padding: "0 2px",
				font: "400 12px/1.5 system-ui, sans-serif",
				color: "var(--dsw-alias-text-3, #8b929c)"
			},
			status: {
				boxSizing: "border-box",
				margin: "0",
				padding: "18px",
				minHeight: "100%",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				font: "400 13px/1.6 system-ui, sans-serif",
				color: "var(--dsw-alias-text-3, #8b929c)"
			}
		};

		/**
		 * Present one video file by streaming it from the plugin's host route.
		 *
		 * The frame hands renderer-mode bodies a load request
		 * (`{kind: "renderer", revision, loaded, failed, reload}`) and leaves the
		 * loading to them. This body points a native <video> at the authenticated
		 * stream route; the browser performs its own Range requests, so seeking
		 * and large files cost only the bytes actually watched.
		 * @param props - document load request, resource identity, and locale.
		 * @returns a player, a progress line, or a decode failure line.
		 */
		function VideoBody(props) {
			const { content, resourceAddress, t } = props;
			const request = content !== undefined && content.kind === "renderer" ? content : undefined;
			const mediaType = mediaTypeOf(resourceAddress);
			// Memoized: parsing must not mint a fresh object per render, or the
			// effects keyed on `file` re-run forever and starve the video load.
			const file = React.useMemo(() => fileAddressOf(resourceAddress), [resourceAddress]);

			const [meta, setMeta] = React.useState(undefined);
			const [broken, setBroken] = React.useState(false);
			const [metadataReady, setMetadataReady] = React.useState(false);

			const routeQuery = React.useMemo(
				() => (file === undefined ? undefined : new URLSearchParams({ sessionId: file.sessionId, path: file.path }).toString()),
				[file]
			);

			// File metadata: size for the meta line and the version reported as loaded.
			React.useEffect(() => {
				if (file === undefined) return undefined;
				const controller = new AbortController();
				fetch(`${STAT_ROUTE}?${routeQuery}`, { signal: controller.signal })
					.then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
					.then((data) => setMeta(data))
					.catch(() => {});
				return () => controller.abort();
			}, [file, routeQuery]);

			// Report the loaded source version once both metadata and the stat agree.
			const revision = request?.revision;
			React.useEffect(() => {
				if (request === undefined || !metadataReady) return;
				request.loaded(typeof meta?.version === "string" ? meta.version : "");
			}, [revision, metadataReady, meta]);

			if (file === undefined || request === undefined || mediaType === undefined) {
				return h("p", { style: styles.status, role: "status" }, t("loading"));
			}
			if (broken) {
				return h("p", { style: styles.status, role: "alert" }, t("broken"));
			}
			const name = displayName(resourceAddress);
			const src = `${STREAM_ROUTE}?${routeQuery}`;
			const sizeLine = meta !== undefined && typeof meta.size === "number" ? ` · ${sizeText(meta.size)}` : "";
			return h(
				"div",
				{ style: styles.frame },
				h("video", {
					key: request.revision,
					src,
					controls: true,
					muted: true,
					autoPlay: true,
					playsInline: true,
					preload: "metadata",
					style: styles.video,
					onLoadedMetadata: () => {
						setMetadataReady(true);
					},
					onError: () => {
						setBroken(true);
						request.failed();
					}
				}),
				h(
					"div",
					{ style: styles.meta },
					h("span", { style: styles.name, title: name }, name),
					h("span", { style: styles.detail }, `${t("metaFormat")} ${suffixOf(resourceAddress).toUpperCase()}${sizeLine}`)
				),
				h("div", { style: styles.hint }, t("mutedHint"))
			);
		}

		/**
		 * Required browser services: the renderer registry, the slot registry, and
		 * copy. The preview plugin owns `documentPreviews`; waiting on it means
		 * this renderer never registers before the registry exists.
		 */
		const inject = ["documentPreviews", "slots", "locale"];

		/**
		 * Client plugin body: register dictionaries, the renderer metadata, and
		 * the keyed document body.
		 * @param ctx - client context carrying the preview registry, slots, and copy.
		 */
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "video-preview: dictionaries");
			ctx.effect(() => ctx.documentPreviews.register(videoBodyDefinition(t)), "video-preview: renderer metadata");
			ctx.effect(
				() =>
					ctx.slots.inject("sidebar.right.tab.document", () =>
						ctx.slots.register(
							{
								name: "sidebar.right.tab.document",
								key: VIDEO_BODY_ID,
								locale: NS
							},
							VideoBody
						)
					),
				"video-preview: document body"
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
