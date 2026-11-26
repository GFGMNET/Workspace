# Built-in features

The features that come with the app — Wiki, Knowledge, Gallery, Files, Scripts, Skills, MCP, Chat, Tasks, Calendar, Team,
Map, Diagrams, Contacts, Devices, Issues, Ticket, ComfyUI and Version Control — are the **built-in features**. On the first
start they are copied into `data/features/`, one YAML file each. You can change them there or under **Features**.

## What you need

Nothing.

## Get a deleted one back

1. Open **Features** in the side bar.
2. Click **Restore built-in features** (top right).
3. Tick the ones you want back and click **Restore**.

They come back exactly as the app ships them. If none is missing, the dialog says *All built-in features are there*.

## When a new version of the app changes a built-in feature

Sometimes a new version of the app brings a changed definition of a built-in feature (its `version:` line goes up).
At the next start the app:

1. keeps **your old file** as `<key>_deprecated.yaml`, named "*<Name> (deprecated)*" (a second time: `_deprecated_2`, …);
2. puts the **new definition** in its place (`<key>.yaml`);
3. lets your projects **keep the old one**: in their `project.yaml` a `feature:` line now points to the deprecated one,
   so nothing looks different until you decide;
4. tells you once, at the start: *"<Name> has a new version. Your projects keep the old one until you switch."*

New projects get the new version.

**Switch a tab to the new version:** open the tab. A bar says *This tab uses the old version of <Name>* — click
**Use the new version**. The tab's own settings in `project.yaml` stay as they are.

A built-in feature you deleted stays deleted — an update doesn't bring it back (use *Restore* for that).

## On disk

```
data/features/
  chat.yaml               the current built-in definition
  chat_deprecated.yaml    the old one, kept for projects that still use it
```

See also: [[Features]] · [[Data and Updates|Data-and-Updates]]
