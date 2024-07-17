(async () => {
    // -----------------------------------------------------------------
    // CONFIG (you're safe to edit this)
    // -----------------------------------------------------------------
    // ~ GLOBAL CONFIG
    // -----------------------------------------------------------------
    const MODE = 'publish_drafts'; // 'publish_drafts' / 'sort_playlist';
    const DEBUG_MODE = true; // true / false, enable for more context
    // -----------------------------------------------------------------
    // ~ PUBLISH CONFIG
    // -----------------------------------------------------------------
    const MADE_FOR_KIDS = false; // true / false;
    const VISIBILITY = 'Unlisted'; // 'Public' / 'Private' / 'Unlisted'
    // -----------------------------------------------------------------
    // ~ SORT PLAYLIST CONFIG
    // -----------------------------------------------------------------
    const SORTING_KEY = (one, other) => {
        return one.name.localeCompare(other.name, undefined, {numeric: true, sensitivity: 'base'});
    };
    // END OF CONFIG (not safe to edit stuff below)
    // -----------------------------------------------------------------

    // ----------------------------------
    // COMMON  STUFF
    // ---------------------------------
    const TIMEOUT_STEP_MS = 10;
    const DEFAULT_ELEMENT_TIMEOUT_MS = 5000;

    function debugLog(...args) {
        if (DEBUG_MODE) {
            console.debug(...args);
        }
    }

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    async function waitForElement(selector, baseEl = document, timeoutMs = DEFAULT_ELEMENT_TIMEOUT_MS) {
        let timeout = timeoutMs;
        while (timeout > 0) {
            let element = baseEl.querySelector(selector);
            if (element) {
                return element;
            }
            await sleep(TIMEOUT_STEP_MS);
            timeout -= TIMEOUT_STEP_MS;
        }
        debugLog(`Could not find ${selector} inside`, baseEl);
        return null;
    }

    function click(element) {
        const event = new MouseEvent('mousedown', {bubbles: true, cancelable: false, view: window});
        element.dispatchEvent(event);
        element.click();
        debugLog(element, 'clicked');
    }

    // ----------------------------------
    // PUBLISH STUFF
    // ----------------------------------
    const VISIBILITY_PUBLISH_ORDER = {'Private': 0, 'Unlisted': 1, 'Public': 2};

    const SELECTORS = {
        VIDEO_ROW: 'ytcp-video-row',
        DRAFT_MODAL: '.style-scope.ytcp-uploads-dialog',
        DRAFT_BUTTON: '.edit-draft-button',
        MADE_FOR_KIDS: '#made-for-kids-group',
        RADIO_BUTTON: 'tp-yt-paper-radio-button',
        VISIBILITY_STEPPER: '#step-badge-3',
        VISIBILITY_PAPER_BUTTONS: 'tp-yt-paper-radio-group',
        SAVE_BUTTON: '#done-button',
        SUCCESS_ELEMENT: 'ytcp-video-thumbnail-with-info',
        DIALOG: 'ytcp-dialog.ytcp-video-share-dialog > tp-yt-paper-dialog:nth-child(1)',
        DIALOG_CLOSE_BUTTON: 'tp-yt-iron-icon'
    };

    class SuccessDialog {
        constructor(raw) {
            this.raw = raw;
        }

        async closeDialogButton() {
            return await waitForElement(SELECTORS.DIALOG_CLOSE_BUTTON, this.raw);
        }

        async close() {
            click(await this.closeDialogButton());
            await sleep(50);
            debugLog('Dialog closed');
        }
    }

    class VisibilityModal {
        constructor(raw) {
            this.raw = raw;
        }

        async visibilityRadioButton() {
            const group = await waitForElement(SELECTORS.VISIBILITY_PAPER_BUTTONS, this.raw);
            const value = VISIBILITY_PUBLISH_ORDER[VISIBILITY];
            return group.querySelectorAll(SELECTORS.RADIO_BUTTON)[value];
        }

        async setVisibility() {
            click(await this.visibilityRadioButton());
            debugLog(`Visibility set to ${VISIBILITY}`);
            await sleep(50);
        }

        async saveButton() {
            return await waitForElement(SELECTORS.SAVE_BUTTON, this.raw);
        }

        async isSaved() {
            await waitForElement(SELECTORS.SUCCESS_ELEMENT, document);
        }

        async dialog() {
            return await waitForElement(SELECTORS.DIALOG);
        }

        async save() {
            click(await this.saveButton());
            await this.isSaved();
            debugLog('Changes saved');
            const dialogElement = await this.dialog();
            return new SuccessDialog(dialogElement);
        }
    }

    class DraftModal {
        constructor(raw) {
            this.raw = raw;
        }

        async madeForKidsPaperButton() {
            const nthChild = MADE_FOR_KIDS ? 1 : 2;
            return await waitForElement(`${SELECTORS.RADIO_BUTTON}:nth-child(${nthChild})`, this.raw);
        }

        async selectMadeForKids() {
            click(await this.madeForKidsPaperButton());
            await sleep(50);
            debugLog(`"Made for kids" set as ${MADE_FOR_KIDS}`);
        }

        async visibilityStepper() {
            return await waitForElement(SELECTORS.VISIBILITY_STEPPER, this.raw);
        }

        async goToVisibility() {
            debugLog('Navigating to Visibility step');
            click(await this.visibilityStepper());
            await sleep(50);
            return new VisibilityModal(this.raw);
        }
    }

    class VideoRow {
        constructor(raw) {
            this.raw = raw;
        }

        get editDraftButton() {
            return waitForElement(SELECTORS.DRAFT_BUTTON, this.raw, 20);
        }

        async openDraft() {
            debugLog('Opening draft');
            click(await this.editDraftButton);
            return new DraftModal(await waitForElement(SELECTORS.DRAFT_MODAL));
        }
    }

    function allVideos() {
        return [...document.querySelectorAll(SELECTORS.VIDEO_ROW)].map(el => new VideoRow(el));
    }

    async function editableVideos() {
        const videos = allVideos();
        const editablePromises = videos.map(async video => (await video.editDraftButton) !== null ? video : null);
        return (await Promise.all(editablePromises)).filter(video => video !== null);
    }

    async function publishDrafts() {
        const videos = await editableVideos();
        debugLog(`Found ${videos.length} videos`);
        await sleep(1000);
        for (const video of videos) {
            const draft = await video.openDraft();
            await draft.selectMadeForKids();
            const visibility = await draft.goToVisibility();
            await visibility.setVisibility();
            const dialog = await visibility.save();
            await dialog.close();
            await sleep(50);
        }
    }

    // ----------------------------------
    // SORTING STUFF
    // ----------------------------------
    const SORTING_SELECTORS = {
        MENU_BUTTON: 'button',
        ITEM_MENU: 'tp-yt-paper-listbox#items',
        MENU_ITEM: 'ytd-menu-service-item-renderer'
    };
    const MOVE_TO_TOP_INDEX = 4;
    const MOVE_TO_BOTTOM_INDEX = 5;

    class SortingDialog {
        constructor(raw) {
            this.raw = raw;
        }

        async anyMenuItem() {
            const item = await waitForElement(SORTING_SELECTORS.MENU_ITEM, this.raw);
            if (!item) {
                throw new Error("Could not locate any menu item");
            }
            return item;
        }

        menuItems() {
            return [...this.raw.querySelectorAll(SORTING_SELECTORS.MENU_ITEM)];
        }

        moveToTop() {
            click(this.menuItems()[MOVE_TO_TOP_INDEX]);
        }

        moveToBottom() {
            click(this.menuItems()[MOVE_TO_BOTTOM_INDEX]);
        }
    }

    class PlaylistVideo {
        constructor(raw) {
            this.raw = raw;
        }

        get name() {
            return this.raw.querySelector('#video-title').textContent.trim();
        }

        async dialog() {
            return this.raw.querySelector(SORTING_SELECTORS.MENU_BUTTON);
        }

        async openDialog() {
            click(await this.dialog());
            const dialog = new SortingDialog(await waitForElement(SORTING_SELECTORS.ITEM_MENU));
            await dialog.anyMenuItem();
            return dialog;
        }
    }

    async function playlistVideos() {
        return [...document.querySelectorAll('ytd-playlist-video-renderer')]
            .map(el => new PlaylistVideo(el));
    }

    async function sortPlaylist() {
        debugLog('Sorting playlist');
        const videos = await playlistVideos();
        debugLog(`Found ${videos.length} videos`);
        videos.sort(SORTING_KEY);
        for (let index = 0; index < videos.length; index++) {
            const video = videos[index];
            debugLog({index, name: video.name});
            const dialog = await video.openDialog();
            dialog.moveToBottom();
            await sleep(500);
        }
    }

    // ----------------------------------
    // ENTRY POINT
    // ----------------------------------
    const operations = {
        'publish_drafts': publishDrafts,
        'sort_playlist': sortPlaylist
    };

    await operations[MODE]();

})();
