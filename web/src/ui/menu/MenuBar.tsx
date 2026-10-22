// The menu bar: what is open on the left, every other control folded into a menu, the save state on the right.
import { openProject, resetPanels, saveEdits, setView } from "../../actions";
import { store } from "../../core/store";
import { useEffect } from "react";
import { deleteWorkspace, newWorkspace, openWorkspace, refreshWorkspaces, renameWorkspace } from "../../workspaceActions";
import { useStore } from "../useStore";
import { AddMenu } from "./AddMenu";
import { ColourMenu } from "./ColourMenu";
import { LinksMenu } from "./LinksMenu";
import { Menu, MenuSection } from "./Menu";
import { SettingsMenu } from "./SettingsMenu";
import { ViewMenu } from "./ViewMenu";

export function MenuBar() {
  const s = useStore();
  return (
    <header className="menubar">
      <strong className="brand">neuromap</strong>
      <Menu label="File">
        {(close) => (
          <>
            <WorkspaceList close={close} />
            <div className="menu-items">
              <button onClick={() => (newWorkspace(), close())}>new workspace</button>
              <button disabled={!s.workspace} onClick={() => {
                const to = window.prompt("rename workspace", s.workspace ?? "")?.trim();
                if (to && to !== s.workspace) renameWorkspace(to);
                close();
              }}>rename workspace…</button>
              <button disabled={!s.workspace} onClick={() => (window.confirm(`delete workspace ${s.workspace}?`) && deleteWorkspace(s.workspace!), close())}>delete workspace</button>
              <button onClick={() => (store.set({ picker: true }), close())}>switch project…</button>
              <button disabled={!s.unsaved} onClick={() => (saveEdits(), close())}>save edits <kbd>⌘S</kbd></button>
              <button title="read tags, pair states and peak calls from disk again, as another program (the Qt GUI) left them" disabled={!s.project}
                onClick={() => (openProject(s.project!, true), close())}>reload from disk</button>
              <button onClick={() => (resetPanels(), close())}>reset panels</button>
            </div>
          </>
        )}
      </Menu>
      <Menu label="View">{() => <ViewMenu />}</Menu>
      <Menu label="Links" wide>{() => <LinksMenu />}</Menu>
      <Menu label="Colour" wide>{() => <ColourMenu />}</Menu>
      <Menu label="Add">{(close) => <AddMenu onDone={close} />}</Menu>
      <Menu label="Settings">{() => <SettingsMenu />}</Menu>
      <Menu label="Help" wide>
        {() => (
          <div className="menu-help">
            <p><b>3D:</b> drag pans · ⌘-drag rotates about the point under the cursor · wheel or pinch zooms · click selects · shift- or ⌘-click adds · G shows the move/turn gizmo · right-click adds or moves objects · in a CCG grid, ⌘-click picks a card and shift-click a run of cards · hover a probe to fan its neurons out by height, click it to keep them out</p>
            <p><b>2D:</b> drag pans · wheel zooms · shift-drag box-selects · ⌘-click adds · drag a map by its title · drag neurons into an area to tag them</p>
            <p><b>keys:</b> ↑↓ or j k step pairs · shift S / U / D sets selected / unselected / deleted · group hotkeys tag · ⌘S saves · Esc clears</p>
          </div>
        )}
      </Menu>
      <span className="sep" />
      <div className="seg">
        {(["2d", "3d"] as const).map((v) => <button key={v} className={s.view === v ? "on" : ""} onClick={() => setView(v)}>{v.toUpperCase()}</button>)}
      </div>
      <span className="grow" />
      <button className={s.unsaved ? "on" : ""} disabled={!s.unsaved} onClick={saveEdits} title="write tags, pair states and peak calls to disk (⌘S); nothing is written until then">
        {s.unsaved ? `save ${s.unsaved} edit${s.unsaved > 1 ? "s" : ""}` : "saved"}
      </button>
    </header>
  );
}

function WorkspaceList({ close }: { close(): void }) {
  const s = useStore();
  useEffect(() => void refreshWorkspaces(), []);
  return (
    <MenuSection title={`workspaces · ${s.project}`}>
      {s.workspaces.map((w) => (
        <button key={w} className={`chip plain${w === s.workspace ? " on" : ""}`} onClick={() => (openWorkspace(w), close())}>{w}</button>
      ))}
    </MenuSection>
  );
}
