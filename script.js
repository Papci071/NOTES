import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyDiqfAFewYMQZI4Cy8Mtb5ke-h4MuizwlQ",
    authDomain: "notes-23093.firebaseapp.com",
    projectId: "notes-23093",
    storageBucket: "notes-23093.firebasestorage.app",
    messagingSenderId: "226481476851",
    appId: "1:226481476851:web:6b39d103ecc89658071386",
    measurementId: "G-L65GF83XR4"
  };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);


const provider = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/drive.file");


async function driveFetch(url, options = {}) {
    if (!options.headers) options.headers = {};
    options.headers["Authorization"] = `Bearer ${accessToken}`;

    let res = await fetch(url, options);

    if (res.status === 401) {
        console.warn("Sesja wygasła (401). Wylogowywanie...");
        await logoutUser();
        throw new Error("Sesja wygasła. Zaloguj się ponownie.");
    }

    return res;
}

let activeBlobUrls = [];

//Otwieranie Okna Tworzenia Folderu

const folder_add = document.getElementById("folder_add");
const create_folder_window = document.getElementById("create_folder_window");

let mouseDownInside = false;

document.addEventListener("mousedown", function(e) {
    if (create_folder_window.contains(e.target) || folder_add.contains(e.target)) mouseDownInside = true;
    else mouseDownInside = false;
});

let isUploading = false;

document.addEventListener("click", function(e) {

    if (isUploading) return;

    if (folder_add.contains(e.target))
        create_folder_window.style.display = "block";
    else if (!create_folder_window.contains(e.target) && !mouseDownInside)
        create_folder_window.style.display = "none";
});



//Funkcje Dodające Foldery

const content = document.getElementById("content");
const last_folder = document.getElementById("last_folder");

function AddFolder(dics_id,ne,cr,ie){
const newFolder = document.createElement("div");
newFolder.className = "folder";
newFolder.id = dics_id;

const newFolderImage = document.createElement("div");
newFolderImage.className = "folder_image";
if (cr) newFolderImage.style.backgroundColor = cr;
if (ie) {
    newFolderImage.style.backgroundImage = `url("${ie}")`;
    newFolderImage.style.backgroundSize = "cover";
    newFolderImage.style.backgroundPosition = "center";
    newFolderImage.style.backgroundRepeat = "no-repeat";
  }

const newFolderName = document.createElement("input");
newFolderName.type = "text";
newFolderName.className = "folder_name";
newFolderName.readOnly = true;
newFolderName.maxLength = 12;
if (ne) newFolderName.value = ne;

newFolder.appendChild(newFolderImage);
newFolder.appendChild(newFolderName);
content.insertBefore(newFolder,last_folder);
    
};


///Połączenie z Google (Firebase)

let accessToken = sessionStorage.getItem("drive_token") || null;

document.getElementById("login_btn").addEventListener("click", async function() {
    try {
        const result = await signInWithPopup(auth, provider);
        const credential = GoogleAuthProvider.credentialFromResult(result);

        if (!credential || !credential.accessToken) {
            await logoutUser();
            alert("Aplikacja wymaga dostępu do Dysku Google, aby móc działać.");
            return;
        }

        accessToken = credential.accessToken;
        sessionStorage.setItem("drive_token", accessToken);

        document.getElementById("login_overlay").style.display = "none";
        document.getElementById("login_window").style.display = "none";

        if (!appFolderId) {
            await initAppFolder();
        }
        
    } catch(err) {
        if (err.code !== "auth/popup-closed-by-user") {
            console.error("Błąd logowania: ", err);
        }
    }
});

onAuthStateChanged(auth, async (user) => {
    if (user && accessToken) {
        document.getElementById("login_overlay").style.display = "none";
        document.getElementById("login_window").style.display = "none";
        
        if (!appFolderId) {
            await initAppFolder();
        }
    } else {
        console.log("Wymagane logowanie");
        document.getElementById("login_overlay").style.display = "flex";
        document.getElementById("login_window").style.display = "block";
    }
});

//Wylogowanie Z Konta Google

async function logoutUser() {

    await signOut(auth);

    sessionStorage.removeItem("drive_token");

    currentQueueId++;
    activeBlobUrls.forEach(url => URL.revokeObjectURL(url));
    activeBlobUrls = [];
    Object.keys(imageCache).forEach(key => delete imageCache[key]);

    const existingFolders = document.querySelectorAll("#content .folder:not(#last_folder)");
    existingFolders.forEach(folder => folder.remove());

    const notesTab = document.getElementById("notes_tab");
    if (notesTab) notesTab.classList.remove("active");


    accessToken = null;
    appFolderId = null;

    document.getElementById("login_overlay").style.display = "flex";
    document.getElementById("login_window").style.display = "block";
    document.body.classList.remove("no-scroll");
}

document.getElementById("logout_btn").addEventListener("click", logoutUser);



//Obsługa Systemu Plików

const APP_FOLDER_NAME = "notes_app_web";
let appFolderId = null;

async function initAppFolder() {
    if (!accessToken) return;

    try {
        const query = encodeURIComponent(`name = '${APP_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
        const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;

        const response = await driveFetch(searchUrl);

        const data = await response.json();

        if (data.files && data.files.length > 0) {
            appFolderId = data.files[0].id;
            console.log("Znaleziono folder aplikacji");
        } else {
            console.log("Folder nie istnieje, tworzę nowy...");
            appFolderId = await createFolder(APP_FOLDER_NAME);
            console.log("Stworzono folder aplikacji");
        }

        await loadFolders();
    } catch (err) {
        console.error("Błąd podczas sprawdzania/tworzenia folderu głównego:", err);
    }
}

async function createFolder(folderName, parentFolderId = null) {
    const metadata = {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder"
    };

    if (parentFolderId) {
        metadata.parents = [parentFolderId];
    }

    const res = await driveFetch("https://www.googleapis.com/drive/v3/files", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(metadata)
    });

    const folder = await res.json();
    return folder.id;
}

async function uploadFile(fileName, contentBlob, parentFolderId, mimeType) {
    const metadata = {
        name: fileName,
        parents: [parentFolderId],
        mimeType: mimeType
    };

    const formData = new FormData();
    formData.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    formData.append("file", contentBlob, fileName);

    const res = await driveFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        body: formData
    });

    return await res.json();
}

async function getNextDiscId(parentFolderId) {
    const query = encodeURIComponent(`'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
    const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?pageSize=1000&q=${query}&fields=files(name)`);
    const data = await res.json();

    let maxId = 0;
    if (data.files) {
        data.files.forEach(f => {
            if (f.name.startsWith("disc_id_")) {
                const num = parseInt(f.name.replace("disc_id_", ""), 10);
                if (!isNaN(num) && num > maxId) maxId = num;
            }
        });
    }
    return `disc_id_${maxId + 1}`;
}



//Obsługa Formularza Tworzenia Foldera

const createForm = document.querySelector("#create_folder_window form");
const submitBtn = document.querySelector("#create_folder_window button");

submitBtn.addEventListener("click", async (e) => {
    e.preventDefault();

    const name = document.getElementById("input_name").value;
    const color = document.getElementById("input_color").value;
    const imgInput = document.getElementById("input_img");
    const defaultFiles = document.getElementById("input_default_files").files;
    const imgFile = imgInput.files.length > 0 ? imgInput.files[0] : null;

    const progressContainer = document.getElementById("upload_progress_container");
    const progressFill = document.getElementById("progress_bar_fill");
    const progressText = document.getElementById("progress_text");

    isUploading = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "Tworzenie...";

    try {
        const discFolderIdName = await getNextDiscId(appFolderId);
        const discFolderGoogleId = await createFolder(discFolderIdName, appFolderId);

        const settingsFolderGoogleId = await createFolder("settings", discFolderGoogleId);
        const settingsData = {
            name: name,
            color: color,
            hasImage: !!imgFile
        };
        const settingsBlob = new Blob([JSON.stringify(settingsData, null, 2)], { type: "application/json" });
        await uploadFile("settings.json", settingsBlob, settingsFolderGoogleId, "application/json");

        let localImgPreviewUrl = "";
        if (imgFile) {
            const ext = imgFile.name.split(".").pop();
            await uploadFile(`folder_img.${ext}`, imgFile, settingsFolderGoogleId, imgFile.type);
            localImgPreviewUrl = URL.createObjectURL(imgFile);
            activeBlobUrls.push(localImgPreviewUrl);
        }

        const filesFolderGoogleId = await createFolder("files", discFolderGoogleId);
        const totalFiles = defaultFiles.length;

        if (totalFiles > 0) {
            progressContainer.style.display = "flex";
            progressFill.style.width = "0%";
            progressText.textContent = `0 / ${totalFiles}`;

            for (let i = 0; i < totalFiles; i++) {
                const file = defaultFiles[i];
                const ext = file.name.split(".").pop();
                const newFileName = `file_${i + 1}.${ext}`;
                await uploadFile(newFileName, file, filesFolderGoogleId, file.type);
                const uploadedCount = i + 1;
                const percent = Math.round((uploadedCount / totalFiles) * 100);
                progressFill.style.width = `${percent}%`;
                progressText.textContent = `${uploadedCount} / ${totalFiles}`;
            }
        }

        AddFolder(discFolderIdName, name, color, localImgPreviewUrl);
        createForm.reset();
        create_folder_window.style.display = "none";

    } catch (err) {
        console.error("Błąd zapisu na Dysk:", err);
        alert("Wystąpił błąd podczas przesyłania plików.");
        if (localImgPreviewUrl) URL.revokeObjectURL(localImgPreviewUrl);
    } finally {
        isUploading = false;
        submitBtn.disabled = false;
        submitBtn.textContent = "Stwórz";
        progressContainer.style.display = "none";
        progressFill.style.width = "0%";
        progressText.textContent = "0 / 0";
    }
});



//Załadowanie Folderów Z Dysku

async function loadFolders() {
    if (!appFolderId || !accessToken) return;

    const folderAdd = document.getElementById("folder_add");
    const lastFolder = document.getElementById("last_folder");

    folderAdd.style.display = "none";
    const loader = document.createElement("div");
    loader.className = "spinner";
    loader.id = "folder_loader";
    lastFolder.appendChild(loader);

    try {
        const listUrl = `https://www.googleapis.com/drive/v3/files?pageSize=1000&fields=files(id,name,mimeType,parents)&q=${encodeURIComponent("trashed = false")}`;
        const res = await driveFetch(listUrl);
        const allFilesData = await res.json();
        const allItems = allFilesData.files || [];
        const discFolders = allItems
            .filter(item => item.parents && item.parents.includes(appFolderId) && item.name.startsWith("disc_id_"))
            .sort((a, b) => {
                const numA = parseInt(a.name.replace("disc_id_", ""), 10);
                const numB = parseInt(b.name.replace("disc_id_", ""), 10);
                return numA - numB;
            });

        const renderPromises = discFolders.map(async (folder) => {
            const settingsFolder = allItems.find(item => item.parents && item.parents.includes(folder.id) && item.name === "settings");
            if (!settingsFolder) return null;

            const settingsFiles = allItems.filter(item => item.parents && item.parents.includes(settingsFolder.id));
            const settingsJsonFile = settingsFiles.find(f => f.name === "settings.json");
            const imgFile = settingsFiles.find(f => f.name.startsWith("folder_img."));

            let folderName = folder.name;
            let folderColor = "#C95364";
            let folderImgUrl = "";

            const fetchTasks = [];

            if (settingsJsonFile) {
                fetchTasks.push(
                    driveFetch(`https://www.googleapis.com/drive/v3/files/${settingsJsonFile.id}?alt=media`)
                    .then(r => r.json())
                    .then(data => {
                        if (data.name) folderName = data.name;
                        if (data.color) folderColor = data.color;
                    })
                    .catch(() => {})
                );
            }

            if (imgFile) {
                fetchTasks.push(
                    driveFetch(`https://www.googleapis.com/drive/v3/files/${imgFile.id}?alt=media`)
                    .then(r => r.blob())
                    .then(blob => {
                        folderImgUrl = URL.createObjectURL(blob);
                        activeBlobUrls.push(folderImgUrl);
                    })
                    .catch(() => {})
                );
            }

            await Promise.all(fetchTasks);

            return {
                discId: folder.name,
                name: folderName,
                color: folderColor,
                imgUrl: folderImgUrl
            };
        });
        const foldersToRender = await Promise.all(renderPromises);
        foldersToRender.forEach(folderData => {
            if (folderData) {
                AddFolder(folderData.discId, folderData.name, folderData.color, folderData.imgUrl);
            }
        });

    } catch (err) {
        console.error("Błąd podczas szybkiego ładowania folderów:", err);
    } finally {
        const activeLoader = document.getElementById("folder_loader");
        if (activeLoader) activeLoader.remove();
        folderAdd.style.display = "block";
    }
}



//Otwieranie Widoku Notesu

document.addEventListener("click", function(e) {

    if (isUploading) return;

    if(e.target.classList.contains("folder_image")){

        LoadFiles(e.target.parentElement.id);
        document.getElementById("notes_tab").classList.add("active");
        document.body.classList.add("no-scroll");
        document.getElementById("notes_display_name").innerText = e.target.nextElementSibling.value;


        document.getElementById("notes_top_visual").style.backgroundColor = e.target.style.backgroundColor;
        document.getElementById("notes_visual_cover").style.backgroundColor = e.target.style.backgroundColor;
        document.getElementById("notes_opend_view").style.backgroundColor = e.target.style.backgroundColor;
        document.getElementById("notes_right_visual").style.backgroundColor = e.target.style.backgroundColor;
        document.getElementById("kolejny_potrzebny_divek").style.backgroundColor = e.target.style.backgroundColor;

        active_page_number = 0;
        updateNotesView();

    }
    if(e.target.closest("#close_notes_tab")){
        document.getElementById("notes_tab").classList.remove("active");
        document.body.classList.remove("no-scroll");
        currentQueueId++;

        active_page_number = 0;
        updateNotesView();

        document.getElementById("left_page").innerHTML = "";
        document.getElementById("right_page").innerHTML = "";
    }




});



//Przełączanie Stron Notesu

let active_page_number = 0;

function isSinglePage() {
    return window.innerWidth <= 1190;
}

function hideBtn(btn) {
    btn.style.opacity = "0";
    btn.style.pointerEvents = "none";
    btn.style.visibility = "hidden";
}

function showBtn(btn) {
    btn.style.opacity = "1";
    btn.style.pointerEvents = "auto";
    btn.style.visibility = "visible";
}

function updateNotesView() {
    const prevBtn = document.getElementById("previous_page");
    const nextBtn = document.getElementById("next_page");
    const coverView = document.getElementById("notes_visual_cover");
    const topCards = document.getElementById("notes_visual_cards");
    const notesDisplay = document.getElementById("notes_display");

    if (isLoadingFolderFiles) {
        hideBtn(prevBtn);
        hideBtn(nextBtn);
        return;
    }

    if (active_page_number === 0) {
        notesDisplay.classList.remove("opened");
        notesDisplay.style.removeProperty("width");

        hideBtn(prevBtn);
        showBtn(nextBtn);

        coverView.style.display = "block";
        topCards.style.height = "20px";
        topCards.style.removeProperty("top");
    } else {
        notesDisplay.classList.add("opened");
        notesDisplay.style.removeProperty("width");

        showBtn(prevBtn);
        coverView.style.display = "none";
        topCards.style.height = "26px";
        topCards.style.top = "5px";

        const maxPage = isSinglePage() ? currentNoteFiles.length + 1 : (Math.floor(currentNoteFiles.length / 2) + 1) * 2;

        if (active_page_number >= maxPage) {
            hideBtn(nextBtn);
        } else {
            showBtn(nextBtn);
        }
    }
}

document.getElementById("next_page").addEventListener("click", function() {
    const step = isSinglePage() ? 1 : 2;
    const maxPage = isSinglePage() ? currentNoteFiles.length + 1 : (Math.floor(currentNoteFiles.length / 2) + 1) * 2;

    if (active_page_number < maxPage) {
        active_page_number += step;
        updateNotesView();
        renderCurrentPages();
    }
});


document.getElementById("previous_page").addEventListener("click", function() {
    const step = isSinglePage() ? 1 : 2;

    if (active_page_number > 0) {
        active_page_number = Math.max(0, active_page_number - step);
        updateNotesView();
        renderCurrentPages();
    }
});

let currentNoteFiles = [];
let currentDiscFolderId = null;
let currentQueueId = 0;
let isLoadingFolderFiles = false;

async function LoadFiles(disc_name) {
    Object.keys(imageCache).forEach(key => delete imageCache[key]);
    if (!accessToken || !appFolderId) return;
    
    currentNoteFiles = [];
    currentDiscFolderId = null;
    active_page_number = 0;
    currentQueueId++; 
    const thisSessionId = currentQueueId;

    isLoadingFolderFiles = true;
    updateNotesView();

    console.log("Ładowanie plików dla folderu:", disc_name);

    try {
        const discQuery = encodeURIComponent(`'${appFolderId}' in parents and name = '${disc_name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
        const discRes = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${discQuery}&fields=files(id,name)`);
        const discData = await discRes.json();
        if (!discData.files || discData.files.length === 0) return;

        currentDiscFolderId = discData.files[0].id;

        const filesFolderQuery = encodeURIComponent(`'${currentDiscFolderId}' in parents and name = 'files' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
        const filesFolderRes = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${filesFolderQuery}&fields=files(id,name)`);
        const filesFolderData = await filesFolderRes.json();

        if (!filesFolderData.files || filesFolderData.files.length === 0) return;

        const filesFolderId = filesFolderData.files[0].id;
        const listQuery = encodeURIComponent(`'${filesFolderId}' in parents and trashed = false`);
        const listRes = await driveFetch(`https://www.googleapis.com/drive/v3/files?pageSize=1000&q=${listQuery}&fields=files(id,name,mimeType)`);
        const listData = await listRes.json();
        if (thisSessionId !== currentQueueId) return;

        const rawFiles = listData.files || [];
        currentNoteFiles = rawFiles.sort((a, b) => {
            return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        });

        console.log("Pobrana lista plików do tablicy (posortowana):", currentNoteFiles);

        isLoadingFolderFiles = false;
        updateNotesView();

        if (currentNoteFiles[0]) await getFileBlobUrl(currentNoteFiles[0].id);
        if (currentNoteFiles[1]) await getFileBlobUrl(currentNoteFiles[1].id);

        startBackgroundQueue(thisSessionId);

    } catch (err) {
        console.error("Błąd podczas pobierania listy plików:", err);
    }
}

const imageCache = {};

async function getFileBlobUrl(fileId) {
    if (imageCache[fileId]) return imageCache[fileId];

    try {
        const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);

        const blob = await res.blob();
        if (!blob) return "";

        const url = URL.createObjectURL(blob);
        activeBlobUrls.push(url);
        imageCache[fileId] = url;
        return url;
    } catch (err) {
        console.error("Błąd pobierania pliku strony:", err);
        return "";
    }
}

async function renderCurrentPages() {
    const leftContainer = document.getElementById("left_page");
    const rightContainer = document.getElementById("right_page");

    if (active_page_number === 0) {
        leftContainer.innerHTML = "";
        rightContainer.innerHTML = "";
        return;
    }

    if (isSinglePage()) {
        rightContainer.innerHTML = "";
        const singleFileIndex = active_page_number - 1;
        renderSinglePage(leftContainer, singleFileIndex);
    } else {
        const leftFileIndex = active_page_number - 2;
        const rightFileIndex = active_page_number - 1;
        renderSinglePage(leftContainer, leftFileIndex);
        renderSinglePage(rightContainer, rightFileIndex);
    }
    
}

async function renderSinglePage(container, fileIndex) {
    container.innerHTML = "";

    if (fileIndex === currentNoteFiles.length) {
        const addBtn = document.createElement("div");
        addBtn.className = "add-page-btn";
        addBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
        `;
        addBtn.addEventListener("click", () => {
            document.getElementById("input_append_files").click();
        });
        container.appendChild(addBtn);
        return;
    }

    if (fileIndex > currentNoteFiles.length) {
        return;
    }

    const fileMeta = currentNoteFiles[fileIndex];
    if (!fileMeta) return;

    const spinner = document.createElement("div");
    spinner.className = "page-loader";
    container.appendChild(spinner);

    const imgUrl = await getFileBlobUrl(fileMeta.id);
    if (container.contains(spinner)) {
        container.innerHTML = "";
        if (imgUrl) {
            const img = document.createElement("img");
            img.src = imgUrl;
            img.alt = fileMeta.name;
            container.appendChild(img);
        }
    }
}


async function startBackgroundQueue(sessionId) {
    const totalFiles = currentNoteFiles.length;
    let loadedCount = currentNoteFiles.filter(f => imageCache[f.id]).length;
    
    const startTime = performance.now();
    console.log(`Start pobierania w tle: ${loadedCount} / ${totalFiles} plików`);

    const BATCH_SIZE = 20;

    for (let i = 0; i < currentNoteFiles.length; i += BATCH_SIZE) {
        if (sessionId !== currentQueueId) {
            console.warn("Pobieranie w tle zostało przerwane.");
            return;
        }

        const batch = currentNoteFiles.slice(i, i + BATCH_SIZE);

        const promises = batch.map(async (file) => {
            if (!imageCache[file.id]) {
                await getFileBlobUrl(file.id);
                loadedCount++;
                console.log(`Załadowano: ${loadedCount} / ${totalFiles} (${Math.round((loadedCount / totalFiles) * 100)}%)`);
            }
        });

        await Promise.all(promises);
        await new Promise(resolve => setTimeout(resolve, 40));
    }

    if (sessionId === currentQueueId) {
        const endTime = performance.now();
        const durationSec = ((endTime - startTime) / 1000).toFixed(2);
        console.log(`Zakończono pobieranie! Wszystkie ${loadedCount} / ${totalFiles} plików załadowane w ${durationSec} s.`);
    }
}

document.getElementById("input_append_files").addEventListener("change", async function(e) {
    const selectedFiles = Array.from(e.target.files);
    if (!selectedFiles || selectedFiles.length === 0) return;

    const progressContainer = document.getElementById("notes_upload_progress_container");
    const progressFill = document.getElementById("notes_progress_bar_fill");
    const progressText = document.getElementById("notes_progress_text");

    try {
        const query = encodeURIComponent(`'${currentDiscFolderId}' in parents and name = 'files' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
        const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`);
        const data = await res.json();
        if (!data.files || data.files.length === 0) return;

        const filesFolderId = data.files[0].id;
        const startIndex = currentNoteFiles.length;
        const uploadQueue = [];

        selectedFiles.forEach((file, index) => {
            const tempId = `temp_${Date.now()}_${index}`;
            const ext = file.name.split(".").pop();
            const newFileName = `file_${startIndex + index + 1}.${ext}`;

            const localUrl = URL.createObjectURL(file);
            activeBlobUrls.push(localUrl);
            imageCache[tempId] = localUrl;

            const fileEntry = {
                id: tempId,
                name: newFileName,
                mimeType: file.type
            };

            currentNoteFiles.push(fileEntry);
            uploadQueue.push({ file, newFileName, fileEntry, tempId });
        });

        e.target.value = "";
        updateNotesView();
        renderCurrentPages();
        const totalUploads = uploadQueue.length;
        progressContainer.style.display = "flex";
        progressFill.style.width = "0%";
        progressText.textContent = `0 / ${totalUploads}`;
        for (let i = 0; i < totalUploads; i++) {
            const item = uploadQueue[i];
            const uploaded = await uploadFile(item.newFileName, item.file, filesFolderId, item.file.type);

            const realId = uploaded.id;
            imageCache[realId] = imageCache[item.tempId];
            delete imageCache[item.tempId];
            item.fileEntry.id = realId;

            const uploadedCount = i + 1;
            const percent = Math.round((uploadedCount / totalUploads) * 100);
            progressFill.style.width = `${percent}%`;
            progressText.textContent = `${uploadedCount} / ${totalUploads}`;
        }

        console.log("Wszystkie nowe pliki pomyślnie zsynchronizowane z Dyskiem Google.");

    } catch (err) {
        console.error("Błąd podczas dodawania plików:", err);
        alert("Wystąpił problem podczas zapisywania plików na Dysku.");
    } finally {
        setTimeout(() => {
            progressContainer.style.display = "none";
            progressFill.style.width = "0%";
            progressText.textContent = "0 / 0";
        }, 500);
    }
});

let wasSinglePage = isSinglePage();

window.addEventListener("resize", () => {
    const currentIsSingle = isSinglePage();

    if (active_page_number > 0 && wasSinglePage !== currentIsSingle) {
        if (!currentIsSingle) {
            if (active_page_number % 2 !== 0) {
                active_page_number += 1;
            }
        } else {
            if (active_page_number > 1) {
                active_page_number -= 1;
            }
        }
        wasSinglePage = currentIsSingle;
    }

    if (active_page_number > 0) {
        updateNotesView();
        renderCurrentPages();
    }
});

async function updateFolderSettings(discName, changeType, newValue){
    if (!accessToken || !appFolderId) return;

    try {
        const discQuery = encodeURIComponent(`'${appFolderId}' in parents and name = '${discName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
        const discRes = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${discQuery}&fields=files(id)`);
        const discData = await discRes.json();
        if (!discData.files || discData.files.length === 0) return;

        const discFolderGoogleId = discData.files[0].id;

        const settingsFolderQuery = encodeURIComponent(`'${discFolderGoogleId}' in parents and name = 'settings' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
        const settingsFolderRes = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${settingsFolderQuery}&fields=files(id)`);
        const settingsFolderData = await settingsFolderRes.json();
        if (!settingsFolderData.files || settingsFolderData.files.length === 0) return;

        const settingsFolderGoogleId = settingsFolderData.files[0].id;

        const fileQuery = encodeURIComponent(`'${settingsFolderGoogleId}' in parents and name = 'settings.json' and trashed = false`);
        const fileRes = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${fileQuery}&fields=files(id)`);
        const fileData = await fileRes.json();
        if (!fileData.files || fileData.files.length === 0) return;

        const settingsFileId = fileData.files[0].id;

        const currentDataRes = await driveFetch(`https://www.googleapis.com/drive/v3/files/${settingsFileId}?alt=media`);
        const settingsJson = await currentDataRes.json();

        settingsJson[changeType] = newValue;

        const updatedBlob = new Blob([JSON.stringify(settingsJson, null, 2)], { type: "application/json" });
        await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${settingsFileId}?uploadType=media`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json"
            },
            body: updatedBlob
        });

        console.log(`wartość ${changeType} folderu ${discName} zmieniona na ${newValue}`);
    } catch (err) {
        console.error("Błąd podczas aktualizacji settings.json:", err);
    }
}

let efcmActive = false;
let selectedFolderId = null;

const edit_folder_context_menu =  document.getElementById("edit_folder_context_menu");

window.addEventListener("contextmenu", function(e) {
    e.preventDefault();

    if (efcmActive && !e.target.closest("#edit_folder_context_menu")) {
        edit_folder_context_menu.style.display = "none";
        efcmActive = false;
    }
    
    if (e.target.closest(".folder")) {
        selectedFolderId = e.target.closest(".folder").id;
        if (!selectedFolderId.includes("disc_id_")) return;

        edit_folder_context_menu.style.display = "block";
        efcmActive = true;

        const menuWidth = edit_folder_context_menu.offsetWidth;
        const menuHeight = edit_folder_context_menu.offsetHeight;

        const padding = 15;

        let posX = e.clientX;
        if (posX + menuWidth > window.innerWidth - padding) {
            posX = window.innerWidth - menuWidth - padding;
        }

        let posY = e.clientY;
        if (posY + menuHeight > window.innerHeight - padding) {
            posY = window.innerHeight - menuHeight - padding;
        }

        edit_folder_context_menu.style.left = `${Math.max(padding, posX)}px`;
        edit_folder_context_menu.style.top = `${Math.max(padding, posY)}px`;
    }
});

window.addEventListener("click", function(e){
    if (efcmActive && !e.target.closest("#edit_folder_context_menu")){
        edit_folder_context_menu.style.display="none";
        efcmActive = false;
    }

});


let originalFolderName = "";
let IsRenameing = false;
let renameingFolderId = null;


ctx_rename.addEventListener("click", function(e) {
    IsRenameing = true;
    renameingFolderId = selectedFolderId;
    edit_folder_context_menu.style.display = "none";
    efcmActive = false;

    const folderInput = document.querySelector(`#${renameingFolderId} .folder_name`);
    if (folderInput) {
        originalFolderName = folderInput.value.trim();
        folderInput.readOnly = false;
        folderInput.style.pointerEvents = "auto";
        folderInput.focus();
        folderInput.select();
    }
});

async function finishRenaming() {
    if (!IsRenameing || !renameingFolderId) return;

    const folderId = renameingFolderId;
    IsRenameing = false;
    renameingFolderId = null;

    const folderElement = document.getElementById(folderId);
    const currentInput = folderElement ? folderElement.querySelector(".folder_name") : null;
    if (!currentInput) return;

    currentInput.readOnly = true;
    currentInput.style.pointerEvents = "none";

    let newName = currentInput.value.trim();
    if (!newName) {
        newName = originalFolderName || "Bez nazwy";
        currentInput.value = newName;
    }

    if (newName !== originalFolderName) {
        const spinner = document.createElement("div");
        spinner.className = "rename-spinner";
        folderElement.appendChild(spinner);

        try {
            await updateFolderSettings(folderId,"name", newName);
        } finally {
            spinner.remove();
        }
    }
}

window.addEventListener("mouseup", function(e) {
    if (!IsRenameing) return;

    if (!e.target.closest(`#${renameingFolderId}`) || e.target.classList.contains("folder_image")) {
        finishRenaming();
    }
});

window.addEventListener("keydown", function(e) {
    if (e.key === "Enter" && IsRenameing) {
        finishRenaming();
    }
});

const ctx_change_color = document.getElementById("ctx_change_color");

ctx_change_color.addEventListener("click", function(e) {
    edit_folder_context_menu.style.display = "none";
    efcmActive = false;

    const folderId = selectedFolderId;
    if (!folderId) return;

    const folderImage = document.querySelector(`#${folderId} .folder_image`);
    
    const colorPicker = document.createElement("input");
    colorPicker.type = "color";
    colorPicker.value = folderImage.style.backgroundColor;

    colorPicker.addEventListener("change", async function() {
        const selectedColor = colorPicker.value;
        console.log("Wybrany nowy kolor:", selectedColor);

        folderImage.style.backgroundColor = selectedColor;
        colorPicker.remove()

        console.log(folderId)

        const spinner = document.createElement("div");
        spinner.className = "rename-spinner";
        document.getElementById(folderId).appendChild(spinner);

        try {
            await updateFolderSettings(folderId,"color", selectedColor);
        } finally {
            spinner.remove();
        }


    });


    if ("showPicker" in HTMLInputElement.prototype) {
        colorPicker.showPicker();
    } else {
        colorPicker.click();
    }
});

ctx_change_image.addEventListener("click", function(e){
    edit_folder_context_menu.style.display = "none";
    efcmActive = false;

    const folderId = selectedFolderId;
    if (!folderId) return;

    const imagePicker = document.createElement("input");
    imagePicker.type = "file";
    imagePicker.accept="image/*";

    imagePicker.addEventListener("change", async function(){
        const imageFile = imagePicker.files[0];
        if (!imageFile) return;

        const newImgUrl = URL.createObjectURL(imageFile);
        const folderImage = document.querySelector(`#${folderId} .folder_image`);
        if (folderImage) {
            folderImage.style.backgroundImage = `url("${newImgUrl}")`;
            folderImage.style.backgroundSize = "cover";
            folderImage.style.backgroundPosition = "center";
            folderImage.style.backgroundRepeat = "no-repeat";
        }

        const spinner = document.createElement("div");
        spinner.className = "rename-spinner";
        document.getElementById(folderId).appendChild(spinner);

        try {
            await updateFolderSettings(folderId,"hasImage", true);
            await updateFolderImg(folderId, imageFile);
        } finally {
            spinner.remove();
        }
        
    });


    if ("showPicker" in HTMLInputElement.prototype) {
        imagePicker.showPicker();
    } else {
        imagePicker.click();
    }


});

async function updateFolderImg(discName, imageFile) {
    if (!accessToken || !appFolderId || !imageFile) return;

    try {
        const discQuery = encodeURIComponent(`'${appFolderId}' in parents and name = '${discName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
        const discRes = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${discQuery}&fields=files(id)`);
        const discData = await discRes.json();
        if (!discData.files || discData.files.length === 0) return;

        const discFolderGoogleId = discData.files[0].id;

        const settingsFolderQuery = encodeURIComponent(`'${discFolderGoogleId}' in parents and name = 'settings' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
        const settingsFolderRes = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${settingsFolderQuery}&fields=files(id)`);
        const settingsFolderData = await settingsFolderRes.json();
        if (!settingsFolderData.files || settingsFolderData.files.length === 0) return;

        const settingsFolderGoogleId = settingsFolderData.files[0].id;

        const oldImgQuery = encodeURIComponent(`'${settingsFolderGoogleId}' in parents and name contains 'folder_img.' and trashed = false`);
        const oldImgRes = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${oldImgQuery}&fields=files(id,name)`);
        const oldImgData = await oldImgRes.json();

        if (oldImgData.files && oldImgData.files.length > 0) {
            for (const file of oldImgData.files) {
                await driveFetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
                    method: "DELETE"
                });
            }
        }

        const ext = imageFile.name.split(".").pop();
        const newFileName = `folder_img.${ext}`;
        await uploadFile(newFileName, imageFile, settingsFolderGoogleId, imageFile.type);

        console.log(`Grafika ${newFileName} zaktualizowana na dysku`);
    } catch (err) {
        console.error("Błąd podczas aktualizowania grafiki na Dysku:", err);
    }
}

ctx_delete.addEventListener("click",async function(e){
    edit_folder_context_menu.style.display = "none";
    efcmActive = false;

    const folderId = selectedFolderId;
    if (!folderId) return;

    const folderName = document.querySelector(`#${folderId} .folder_name`).value;
    
    if (!confirm(`Ta akcja spowoduje usunięcie folderu "${folderName}" i wszystkich plików z nim powiązanych. Czy jesteś pewny tej akcji?`)) return;

        const spinner = document.createElement("div");
        spinner.className = "rename-spinner";
        document.getElementById(folderId).appendChild(spinner);

        try {
            await deleteFolder(folderId);
            document.querySelector(`#${folderId}`).remove();

        } catch (err) {
            spinner.remove();
        }

});

async function deleteFolder(discName) {

    if (!accessToken || !appFolderId) return;

    try {
        const discQuery = encodeURIComponent(`'${appFolderId}' in parents and name = '${discName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
        const discRes = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${discQuery}&fields=files(id)`);
        const discData = await discRes.json();
        if (!discData.files || discData.files.length === 0) return;

        const discFolderGoogleId = discData.files[0].id;

        await driveFetch(`https://www.googleapis.com/drive/v3/files/${discFolderGoogleId}`, {
            method: "DELETE"
        });

        console.log(`Folder ${discName} usunięty`);
    } catch (err) {
        console.error("Błąd podczas usuwania folderu", err);
        throw err;
    }
    
};



