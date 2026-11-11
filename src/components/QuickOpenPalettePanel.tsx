import { Plus } from "@phosphor-icons/react";
import { useMemo, type ReactNode, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { NoteSearchResult } from "../hooks/useNoteSearch";
import type { AppLocale } from "../lib/i18n";
import { translate } from "../lib/i18n";
import type { VaultEntry } from "../types";
import { relativePathForVaultItem } from "../utils/deepLinks";
import { vaultPathForEntry } from "../utils/workspaces";
import { NoteSearchList } from "./NoteSearchList";

interface QuickOpenPalettePanelProps {
	inputRef: RefObject<HTMLInputElement | null>;
	query: string;
	locale: AppLocale;
	results: NoteSearchResult[];
	/** Vault root used to show each result's path; omit to hide paths. */
	vaultPath?: string;
	selectedIndex: number;
	isLoading: boolean;
	onQueryChange: (query: string) => void;
	onSelect: (entry: VaultEntry) => void;
	onSelectedIndexChange: (index: number) => void;
	createAction: {
		canCreate: boolean;
		title: string;
		onCreate: () => void | Promise<void>;
		disabled: boolean;
	};
}

interface QuickOpenPaletteDialogProps {
	rootRef: RefObject<HTMLDivElement | null>;
	onClose: () => void;
	children: ReactNode;
}

/** The note's path inside its vault, or null when it adds nothing beyond the title. */
function quickOpenPathLabel(entry: VaultEntry, vaultPath: string | undefined): string | null {
	if (!vaultPath) return null;
	const relative = relativePathForVaultItem({
		itemPath: entry.path,
		vaultPath: vaultPathForEntry(entry, vaultPath),
	});
	if (!relative) return null;
	const repeatsTitle =
		!relative.includes("/") && relative.replace(/\.md$/iu, "") === entry.title;
	return repeatsTitle ? null : relative;
}

function quickOpenEmptyMessage(isLoading: boolean, locale: AppLocale): string {
	return isLoading
		? translate(locale, "status.vault.reloading")
		: translate(locale, "noteList.empty.noMatching");
}

function QuickOpenCreateAction({
	title,
	onCreate,
	disabled,
	locale,
}: {
	title: string;
	onCreate: () => void | Promise<void>;
	disabled: boolean;
	locale: AppLocale;
}) {
	return (
		<div className="border-t border-border p-2">
			<Button
				type="button"
				variant="ghost"
				className="h-9 w-full justify-start gap-2 px-2 text-sm"
				disabled={disabled}
				onClick={() => {
					void onCreate();
				}}
			>
				<Plus size={14} className="shrink-0" />
				<span className="truncate">
					{translate(locale, "noteList.quickOpenCreate", { title })}
				</span>
			</Button>
		</div>
	);
}

export function QuickOpenPalettePanel(props: QuickOpenPalettePanelProps) {
	const {
		inputRef,
		query,
		locale,
		results,
		vaultPath,
		selectedIndex,
		isLoading,
		onQueryChange,
		onSelect,
		onSelectedIndexChange,
		createAction,
	} = props;
	const items = useMemo(
		() =>
			results.map((result) => ({
				...result,
				pathLabel: quickOpenPathLabel(result.entry, vaultPath),
			})),
		[results, vaultPath],
	);
	return (
		<div className="relative z-10 flex w-[500px] max-w-[90vw] max-h-[400px] flex-col self-start overflow-hidden rounded-xl border border-[var(--border-dialog)] bg-popover shadow-[0_8px_32px_var(--shadow-dialog)]">
			<Input
				ref={inputRef}
				className="h-auto rounded-none border-0 border-b border-border px-4 py-3 text-[15px] shadow-none focus-visible:border-border focus-visible:ring-0"
				type="text"
				placeholder={translate(locale, "noteList.searchPlaceholder")}
				value={query}
				onChange={(event) => onQueryChange(event.target.value)}
			/>
			<NoteSearchList
				items={items}
				selectedIndex={selectedIndex}
				getItemKey={(item) => item.entry.path}
				onItemClick={(item) => onSelect(item.entry)}
				onItemHover={onSelectedIndexChange}
				emptyMessage={quickOpenEmptyMessage(isLoading, locale)}
				className="flex-1 overflow-y-auto"
			/>
			{createAction.canCreate && (
				<QuickOpenCreateAction
					title={createAction.title}
					onCreate={createAction.onCreate}
					disabled={createAction.disabled}
					locale={locale}
				/>
			)}
		</div>
	);
}

export function QuickOpenPaletteDialog({
	rootRef,
	onClose,
	children,
}: QuickOpenPaletteDialogProps) {
	return (
		<div
			ref={rootRef}
			data-testid="quick-open-palette"
			className="fixed inset-0 z-[1000] flex justify-center bg-[var(--shadow-dialog)] pt-[15vh]"
		>
			<button
				type="button"
				aria-label="Close quick open"
				className="absolute inset-0 z-0 cursor-default border-0 bg-transparent p-0"
				onClick={onClose}
			/>
			{children}
		</div>
	);
}
