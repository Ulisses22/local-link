const socket = io();

// DOM elements
const accessCodeInput = document.getElementById('accessCode');
const connectButton = document.getElementById('connectButton');
const fileArea = document.getElementById('fileArea');
const fileInput = document.getElementById('fileInput');
const message = document.getElementById('message');
const errorMessage = document.getElementById('errorMessage');
const errorMessageFile = document.getElementById('errorMessageFile');
const clientList = document.getElementById('clientList');
const connectedClientsUl = document.getElementById('connectedClients');
const connectionForm = document.getElementById('connectionForm');
const dropArea = document.getElementById('dropArea');
const sendFileButton = document.getElementById('sendFileButton');

// Toast configuration using SweetAlert
const Toast = Swal.mixin({
    toast: true,
    position: "top-end",
    showConfirmButton: false,
    timer: 5000,
    timerProgressBar: true,
    didOpen: (toast) => {
        toast.onmouseenter = Swal.stopTimer;
        toast.onmouseleave = Swal.resumeTimer;
    }
});

// Authentication function
connectButton.addEventListener('click', () => {
    const accessCode = accessCodeInput.value.trim();

    // Validate access code
    if (accessCode === "") {
        errorMessage.textContent = "Please enter the access code.";
        errorMessage.classList.add('animate-shake');
        return;
    }

    // Emit access code to the server for authentication
    socket.emit('authenticate', accessCode);

    socket.on('authenticated', (success) => {
        if (success) {
            // Show file area and client list upon successful authentication
            connectionForm.classList.add('hidden');
            fileArea.classList.remove('hidden');
            clientList.classList.remove('hidden');
            errorMessage.textContent = '';
            message.textContent = "Let's go!";
        } else {
            errorMessage.textContent = "Invalid access code. Please try again.";
        }
    });

    // Update the list of connected devices
    socket.on('update-connected-clients', (clients) => {
        connectedClientsUl.innerHTML = ''; // Clear the device list

        // Iterate through connected devices and render them
        for (let clientId in clients) {
            const device = clients[clientId];
            const isOwnDevice = clientId === socket.id;

            // Skip rendering for the user's own device
            if (isOwnDevice) continue;

            const li = document.createElement('li');
            li.classList.add('flex', 'items-center', 'space-x-4', 'py-2', 'px-4', 'bg-gray-100', 'rounded-lg', 'shadow-sm');

            li.innerHTML = `
                <!-- Device icon -->
                <span class="flex items-center justify-center w-12 h-12 bg-indigo-600 text-white rounded-full text-2xl">
                    ${device.icon}
                </span>
                <div class="flex-grow">
                    <strong class="text-lg text-indigo-700">${device.name}</strong>
                    <p class="text-sm text-gray-500">${device.os}</p>
                </div>
            `;
            connectedClientsUl.appendChild(li); // Add the device to the list
        }
    });
});

// Handle file selection
fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        handleFileUpload(file);
    }
});

// File upload handling function
function handleFileUpload(file) {
    const reader = new FileReader();

    // Show loading progress bar
    document.getElementById('progressContainer').classList.remove('hidden');
    const progressBar = document.getElementById('progressBar');
    let progress = 0;

    reader.onloadstart = () => {
        message.textContent = "Ready for submission...";
    };

    reader.onprogress = (event) => {
        if (event.lengthComputable) {
            progress = (event.loaded / event.total) * 100;
            progressBar.style.width = `${progress}%`;  // Update progress bar width
        }
    };

    reader.onloadend = () => {
        // Store file data without sending automatically
        const fileData = {
            filename: file.name,
            fileContent: reader.result,
            fileSize: file.size
        };

        // Show "Send File" button
        document.getElementById('sendFileButton').classList.remove('hidden');
        document.getElementById('sendFileButton').onclick = () => {
            sendFile(fileData);  // Call the sendFile function
        };
    };

    reader.readAsDataURL(file); // Convert the file to base64
}

// File sending function
function sendFile(fileData) {
    // Emit the file data to the server
    socket.emit('send-file', fileData);

    // Clear message
    message.textContent = "";

    // Wait for server response
    socket.once('send-file-response', (response) => {
        if (response.success) {
            // Success - Show success Toast
            Toast.fire({
                icon: "success",
                title: "File received successfully!"
            });
        } else {
            // Failure - Show error Toast
            Toast.fire({
                icon: "error",
                title: "Error sending file. Please try again."
            });
        }
    });

    // Hide progress container and send button
    document.getElementById('progressContainer').classList.add('hidden');
    document.getElementById('sendFileButton').classList.add('hidden');
}

// Handle receiving a file from another device
socket.on('receive-file', (data) => {
    const a = document.createElement('a');
    a.href = data.fileContent;
    a.download = data.filename;

    // Trigger file download
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);  // Remove the link after clicking

    // Show success Toast
    Toast.fire({
        icon: "success",
        title: "File received successfully!"
    });
});

// Handle QR code generation and rendering
socket.on('qr-code', (qrCodeUrl) => {
    const qrCodeImage = document.getElementById('qr-code');
    if (qrCodeImage) {
        qrCodeImage.src = qrCodeUrl;  // Update the <img> tag source with the QR code
    } else {
        console.error('QR code image element not found.');
    }
});

// Handle sharing a link
socket.on('link', (link) => {
    const shareLink = document.getElementById('share-link');
    if (shareLink) {
        shareLink.href = link; // Set the href attribute for the link
        shareLink.textContent = 'Click here'; // Set the text for the link
    } else {
        console.error('Share link element not found.');
    }
});

// Copy the current page URL to the clipboard
function copyToClipboard(event) {
    event.preventDefault();  // Prevent default link behavior

    const tempInput = document.createElement('input');
    document.body.appendChild(tempInput);

    tempInput.value = window.location.href;  // Set input value to current page URL
    tempInput.select();
    tempInput.setSelectionRange(0, 99999);  // For mobile devices

    document.execCommand('copy');  // Copy the URL to clipboard
    document.body.removeChild(tempInput);  // Remove the temporary input

    // Show success Toast
    Toast.fire({
        icon: "success",
        title: "Link copied to clipboard!"
    });
}

// Format file size for display
function formatFileSize(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i)) + ' ' + sizes[i];
}

// Error handling when file cannot be sent
socket.on('file-error', () => {
    Toast.fire({
        icon: "error",
        title: "Error sending file. Please try again."
    });
});

// Drag-and-drop functionality for file uploads
dropArea.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropArea.classList.add('bg-gray-100');
});

dropArea.addEventListener('dragleave', () => {
    dropArea.classList.remove('bg-gray-100');
});

dropArea.addEventListener('drop', (event) => {
    event.preventDefault();
    dropArea.classList.remove('bg-gray-100');
    const file = event.dataTransfer.files[0];
    if (file) {
        handleFileUpload(file);  // Handle the dropped file
    }
});

dropArea.addEventListener('click', () => {
    fileInput.click();  // Trigger file input click when drop area is clicked
});

// Open information panel
document.getElementById('openInfoPanel').addEventListener('click', () => {
    document.getElementById('infoPanel').classList.remove('hidden');
});

// Close information panel
document.getElementById('closeInfoPanel').addEventListener('click', () => {
    document.getElementById('infoPanel').classList.add('hidden');
});
