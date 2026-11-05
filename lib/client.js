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

		/** Suffix to the media type handed to the Blob that backs the video URL. */
		const MEDIA_TYPES = {
			mp4: "video/mp4",
			m4v: "video/mp4",
			webm: "video/webm",
			ogv: "video/ogg",
			ogg: "video/ogg",
			mov: "video/quicktime"
		};

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
		 */
		function videoBodyDefinition(translate) {
			return {
				id: VIDEO_BODY_ID,
				extensions: VIDEO_EXTENSIONS,
				binaryExtensions: VIDEO_EXTENSIONS,
				priority: "extension",
				title: () => translate("title"),
				loading: "bytes-complete",
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
		 * Present one complete video file: bytes in, Blob URL out.
		 *
		 * The frame hands the body either `{ kind: "bytes" }` (content loaded) or
		 * a text-shaped placeholder while the complete read is in flight, so the
		 * first branch below is the loading state, not an error.
		 * @param props - document bytes, resource identity, and locale.
		 * @returns a player, a progress line, or a decode failure line.
		 */
		function VideoBody(props) {
			const { content, resourceAddress, t } = props;
			const mediaType = mediaTypeOf(resourceAddress);
			const data = content !== void 0 && content.kind === "bytes" ? content.data : void 0;

			const [view, setView] = React.useState({ kind: "waiting" });
			const [muted, setMuted] = React.useState(true);
			const videoRef = React.useRef(null);

			// Bytes to a Blob URL; the URL is revoked when the file or renderer changes.
			React.useEffect(() => {
				if (data === void 0 || mediaType === void 0) {
					setView({ kind: "waiting" });
					return void 0;
				}
				let url;
				try {
					url = URL.createObjectURL(new Blob([data], { type: mediaType }));
				} catch {
					setView({ kind: "failed" });
					return void 0;
				}
				setView({ kind: "ready", url });
				return () => {
					URL.revokeObjectURL(url);
				};
			}, [data, mediaType]);

			// Muted autoplay: browsers refuse audible autoplay, and a preview that
			// starts silently beats one that waits for a click.
			React.useEffect(() => {
				if (view.kind !== "ready") return;
				const video = videoRef.current;
				if (video === null) return;
				video.muted = true;
				const started = video.play();
				if (started !== void 0 && typeof started.catch === "function") started.catch(() => {});
			}, [view.kind, view.url]);

			if (data === void 0 || mediaType === void 0 || view.kind === "waiting") {
				return h("p", { style: styles.status, role: "status" }, t("loading"));
			}
			if (view.kind === "failed") {
				return h("p", { style: styles.status, role: "alert" }, t("failed"));
			}
			if (view.kind === "broken") {
				return h("p", { style: styles.status, role: "alert" }, t("broken"));
			}
			const name = displayName(resourceAddress);
			return h(
				"div",
				{ style: styles.frame },
				h("video", {
					key: view.url,
					ref: videoRef,
					src: view.url,
					controls: true,
					playsInline: true,
					preload: "metadata",
					style: styles.video,
					onError: () => setView({ kind: "broken" }),
					onVolumeChange: (event) => setMuted(event.currentTarget.muted !== false)
				}),
				h(
					"div",
					{ style: styles.meta },
					h("span", { style: styles.name, title: name }, name),
					h("span", { style: styles.detail }, `${t("metaFormat")} ${suffixOf(resourceAddress).toUpperCase()} · ${sizeText(data.byteLength)}`)
				),
				muted ? h("div", { style: styles.hint }, t("mutedHint")) : null
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
