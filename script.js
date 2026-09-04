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
provider.setCustomParameters({
    prompt: 'consent'
});


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

const newFolderName = document.createElement("div");
newFolderName.className = "folder_name";
if (ne) newFolderName.textContent = ne;

newFolder.appendChild(newFolderImage);
newFolder.appendChild(newFolderName);
content.insertBefore(newFolder,last_folder);
    
};


//Połączenie z Google (Firebase)

let accessToken = sessionStorage.getItem("drive_token") || null;

document.getElementById("login_btn").addEventListener("click", async function() {
    try{
        const result = await signInWithPopup(auth, provider);
        const credential = GoogleAuthProvider.credentialFromResult(result);

        if(!credential.accessToken){
            await logoutUser();
            alert("Aplikacja wymaga dostępu do Dysku Google, aby móc działać.")
            return;
        }

        accessToken = credential.accessToken;
        sessionStorage.setItem("drive_token", accessToken);

        document.getElementById("login_overlay").style.display = "none";
        document.getElementById("login_window").style.display = "none";
        await initAppFolder();
        
    } catch(err) {
        console.error("Błąd logowania: ", err);
    }

});


onAuthStateChanged(auth, async (user) => {
    if (user) {
        document.getElementById("login_overlay").style.display = "none";
        document.getElementById("login_window").style.display = "none";
        if (accessToken && !appFolderId) {
            await initAppFolder();
        }
    } else {
        console.log("Użytkownik nie jest zalogowany.");
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

        const response = await fetch(searchUrl, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
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

    const res = await fetch("https://www.googleapis.com/drive/v3/files", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
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

    const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`
        },
        body: formData
    });

    if (res.status === 401) {
        console.warn("Sesja wygasła podczas uploadu (401 Unauthorized).");
        logoutUser();
        throw new Error("401 Unauthorized");
    }

    return await res.json();
}

async function getNextDiscId(parentFolderId) {
    const query = encodeURIComponent(`'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?pageSize=1000&q=${query}&fields=files(name)`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
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

    if (!appFolderId) {
        alert("Brak folderu głównego na Dysku!");
        return;
    }

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
        const res = await fetch(listUrl, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
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
                    fetch(`https://www.googleapis.com/drive/v3/files/${settingsJsonFile.id}?alt=media`, {
                        headers: { Authorization: `Bearer ${accessToken}` }
                    })
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
                    fetch(`https://www.googleapis.com/drive/v3/files/${imgFile.id}?alt=media`, {
                        headers: { Authorization: `Bearer ${accessToken}` }
                    })
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
        document.getElementById("notes_display_name").innerText = e.target.nextElementSibling.textContent;


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
        currentQueueId++;
    }




});



//Przełączanie Stron Notesu

let active_page_number = 0;

function updateNotesView() {
    const prevBtn = document.getElementById("previous_page");
    const nextBtn = document.getElementById("next_page");
    const coverView = document.getElementById("notes_visual_cover");
    const openView = document.getElementById("notes_opend_view");
    const topCards = document.getElementById("notes_visual_cards");

    if (isLoadingFolderFiles) {
        nextBtn.style.display = "none";
        prevBtn.style.display = "none";
        return;
    }

    if (active_page_number === 0) {
        prevBtn.style.display = "none";
        nextBtn.style.display = "flex";
        coverView.style.display = "block";
        openView.style.display = "none";
        topCards.style.height = "20px";
        topCards.style.removeProperty("top");
    } else {
        prevBtn.style.display = "flex";
        coverView.style.display = "none";
        openView.style.display = "flex";
        topCards.style.height = "26px";
        topCards.style.top = "5px";

        const maxPage = (Math.floor(currentNoteFiles.length / 2) + 1) * 2;
        if (active_page_number >= maxPage) {
            nextBtn.style.display = "none";
        } else {
            nextBtn.style.display = "flex";
        }
    }
}

document.getElementById("next_page").addEventListener("click", function() {
    const maxPage = (Math.floor(currentNoteFiles.length / 2) + 1) * 2;
    if (active_page_number < maxPage) {
        active_page_number += 2;
        updateNotesView();
        renderCurrentPages();
    }
});


document.getElementById("previous_page").addEventListener("click", function() {
    if (active_page_number > 0) {
        active_page_number -= 2;
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
        const discRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${discQuery}&fields=files(id,name)`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const discData = await discRes.json();
        if (!discData.files || discData.files.length === 0) return;

        currentDiscFolderId = discData.files[0].id;

        const filesFolderQuery = encodeURIComponent(`'${currentDiscFolderId}' in parents and name = 'files' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
        const filesFolderRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${filesFolderQuery}&fields=files(id,name)`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const filesFolderData = await filesFolderRes.json();

        if (!filesFolderData.files || filesFolderData.files.length === 0) return;

        const filesFolderId = filesFolderData.files[0].id;
        const listQuery = encodeURIComponent(`'${filesFolderId}' in parents and trashed = false`);
        const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?pageSize=1000&q=${listQuery}&fields=files(id,name,mimeType)`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
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
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (res.status === 401) {
            console.warn("Sesja wygasła (401 Unauthorized). Wymagane ponowne logowanie.");
            logoutUser();
            return "";
        }
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

    const leftFileIndex = active_page_number - 2;
    const rightFileIndex = active_page_number - 1;

    renderSinglePage(leftContainer, leftFileIndex);
    renderSinglePage(rightContainer, rightFileIndex);
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
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
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