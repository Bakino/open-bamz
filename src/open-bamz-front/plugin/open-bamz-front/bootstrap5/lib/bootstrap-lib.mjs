

// AAconst CSS_FILES = [
//     "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"
// ]
const JS_FILES = [
    "https://cdn.jsdelivr.net/npm/bootstrap@5.0.2/dist/js/bootstrap.bundle.min.js"
]

// for(let css of CSS_FILES){
//     const link = document.createElement("link");
//     link.rel = "stylesheet";
//     link.type = "text/css";
//     link.href = css;
//     document.head.appendChild(link);
// }

// load the custom theme CSS file because variable must be compiled
const link = document.createElement("link");
link.rel = "stylesheet";
link.type = "text/css";
link.href = `./bootstrap5/${window.BAMZ_APP}/theme-bootstrap5.css`;
document.head.appendChild(link);


for(let js of JS_FILES){
    const script = document.createElement("script");
    script.async = true;
    script.type = "text/javascript";
    script.src = js;
    document.head.appendChild(script);
}

window.bootstrap5 = {} ; 

/****** FORM VALIDATION ********/
window.bootstrap5.validateForm = function(form){
    form.classList.add("was-validated") ;
    let formFeedback = form.querySelector(".form-feedback") ;
    if(formFeedback){
        formFeedback.innerHTML = "" ;
        formFeedback.classList.add("d-none") ;
    }
    if(!form.checkValidity()){
        let invalidInputs = Array.from(form.querySelectorAll(":invalid")) ;
        let messages = [] ;
        for(let invalidInput of invalidInputs){
            let parentElement = invalidInput.parentElement ;
            let feedbackEl = parentElement.querySelector(".invalid-feedback") ;
            let labelEl = parentElement.querySelector("label") ;
            let label = "" ;
            if(labelEl){
                label = labelEl.innerHTML ;
            }
            if(!feedbackEl){
                feedbackEl = document.createElement("DIV"); 
                feedbackEl.className = "invalid-feedback" ;
                parentElement.appendChild(feedbackEl) ;
            }
            feedbackEl.innerHTML = invalidInput.validationMessage ;
            messages.push({label, message: invalidInput.validationMessage, input: invalidInput}) ; 
        }
        if(formFeedback){
            formFeedback.classList.remove("d-none") ;
            for(let msg of messages){
                let divMsg = document.createElement("DIV") ;
                divMsg.style.cursor = "pointer" ;
                divMsg.innerHTML = `${msg.label}${msg.label?' : ':''}${msg.message}` ;
                divMsg.addEventListener("click", ()=>{
                    msg.input.focus() ;
                })
                formFeedback.appendChild(divMsg) ;
            }
        }
        return false;
    }
    return true;
}

/****** DIALOGS ********/
window.bootstrap5.dialogs = {} ;


function makeDraggable(modal){

    const modalDialog = modal.querySelector('.modal-dialog');
    const modalHeader = modal.querySelector('.modal-header');
    modalHeader.style.cursor = "move" ;
    modalDialog.style.transition = "transform 0.1s ease-out";

    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    modalHeader.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

    function dragStart(e) {
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;

        if (e.target === modalHeader) {
            isDragging = true;
        }
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;

            xOffset = currentX;
            yOffset = currentY;

            setTranslate(currentX, currentY, modalDialog);
        }
    }

    function dragEnd() {
        initialX = currentX;
        initialY = currentY;

        isDragging = false;
    }

    function setTranslate(xPos, yPos, el) {
        el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
    }
}

window.bootstrap5.dialogs.prepareModal = function ({title, bodyContents, footerContents, headerClass, size, draggable, closeable}) {
    let canClose = closeable !== false;

    let fullScreenDown = "" ;
    if(size === "lg"){
        //if modal size is lg, force fullscreen for sm screen
        fullScreenDown = "modal-fullscreen-md-down" ;
    }else if(size === "xl"){
        //if modal size is lg, force fullscreen for sm screen
        fullScreenDown = "modal-fullscreen-lg-down" ;
    }

    const modalHtml = `
  <div class="modal-dialog ${size?`modal-${size}`:""} ${fullScreenDown}">
    <div class="modal-content">
      <div class="modal-header ${headerClass}">
        <h5 class="modal-title">${title}</h5>
        ${canClose?`<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>`:""}
      </div>
      <div class="modal-body">
       ${bodyContents}
      </div>
      ${footerContents?`<div class="modal-footer">
        ${footerContents}
      </div>`:""}
    </div>
  </div>
    `
    let elModal = document.createElement("DIV") ;
    elModal.className = "modal fade" ;
    elModal.tabIndex = "-1" ;
    elModal.innerHTML = modalHtml ;
    document.body.appendChild(elModal) ;

    if(draggable !== false){
        elModal.addEventListener('shown.bs.modal', ()=>{
            makeDraggable(elModal) ;
        }) ;
    }

    return elModal;
};

window.bootstrap5.dialogs.modal = function ({title, bodyContents, footerContents, headerClass, backdrop, focus, keyboard, size, draggable, closeable}) {
   
    const elModal = window.bootstrap5.dialogs.prepareModal({title, bodyContents, footerContents, headerClass, size,draggable, closeable})

    let canClose = closeable !== false;

    let options = {} ;
    if(backdrop !== undefined){ options.backdrop = backdrop; }
    if(focus !== undefined){ options.focus = focus; }
    if(keyboard !== undefined){ options.keyboard = keyboard; }
    if(!canClose){
        //not closeable, for keyboard to false
        options.keyboard = false;
        options.backdrop = "static";
    }

    let bsModal = new window.bootstrap.Modal(elModal, options) ;
    bsModal.show() ;

    return new Promise(resolve=>{
        elModal.addEventListener('hidden.bs.modal', ()=>{
            bsModal.dispose() ;
            document.body.removeChild(elModal) ;
            resolve() ;
        })
    }) ;
} 

window.bootstrap5.dialogs.info = function ({message, title, labelOk, backdrop, focus, keyboard, size,draggable, closeable}) {
    let msgOk = labelOk??"OK" ;

    return window.bootstrap5.dialogs.modal({
        title: title??`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-info-circle" viewBox="0 0 16 16">
        <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/>
        <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0"/>
      </svg>`, 
        bodyContents: `<p>${(""+message).replace(/\n/g, "<br />")}</p>`, 
        footerContents: `<button type="button" class="btn btn-primary" data-bs-dismiss="modal">${msgOk}</button>`, 
        backdrop, focus, keyboard, size, draggable, closeable
    });
} 

window.bootstrap5.dialogs.error = function ({message, title, labelOk, backdrop, focus, keyboard, size, draggable, closeable}) {
    let msgOk = labelOk??"OK" ;

    return window.bootstrap5.dialogs.modal({
        title: title??`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-exclamation-triangle-fill" viewBox="0 0 16 16">
  <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5m.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2"/>
</svg>`, 
        headerClass: "text-bg-danger",
        bodyContents: `<p>${(""+message).replace(/\n/g, "<br />")}</p>`, 
        footerContents: `<button type="button" class="btn btn-danger" data-bs-dismiss="modal">${msgOk}</button>`, 
        backdrop, focus, keyboard, size, draggable, closeable
    });
} 

window.bootstrap5.dialogs.question = function ({message, title, headerClass, choices, backdrop, focus, keyboard, size, draggable, closeable}) {
    const elModal =  window.bootstrap5.dialogs.prepareModal({
        title: title??`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-question-circle" viewBox="0 0 16 16">
  <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/>
  <path d="M5.255 5.786a.237.237 0 0 0 .241.247h.825c.138 0 .248-.113.266-.25.09-.656.54-1.134 1.342-1.134.686 0 1.314.343 1.314 1.168 0 .635-.374.927-.965 1.371-.673.489-1.206 1.06-1.168 1.987l.003.217a.25.25 0 0 0 .25.246h.811a.25.25 0 0 0 .25-.25v-.105c0-.718.273-.927 1.01-1.486.609-.463 1.244-.977 1.244-2.056 0-1.511-1.276-2.241-2.673-2.241-1.267 0-2.655.59-2.75 2.286m1.557 5.763c0 .533.425.927 1.01.927.609 0 1.028-.394 1.028-.927 0-.552-.42-.94-1.029-.94-.584 0-1.009.388-1.009.94"/>
</svg>`, 
        headerClass,
        bodyContents: `<p>${(""+message).replace(/\n/g, "<br />")}</p>`, 
        footerContents: choices.map(function(choice){
            return '<button type="button" class="btn '+choice.className+' btn-'+choice.code+'">'+choice.label+'</button>' ;  
        }).join(""), 
        size, draggable, closeable
    });

    let canClose = closeable !== false;

    let options = {} ;
    if(backdrop !== undefined){ options.backdrop = backdrop; }
    if(focus !== undefined){ options.focus = focus; }
    if(keyboard !== undefined){ options.keyboard = keyboard; }
    if(!canClose){
        //not closeable, for keyboard to false
        options.keyboard = false;
        options.backdrop = "static";
    }

    let bsModal = new window.bootstrap.Modal(elModal, options) ;

    return new Promise(resolve=>{
        let callbackCalled = false;
        choices.forEach(function(choice){
            const button = elModal.querySelector(".btn-"+choice.code);
            if(choice.focus){
                elModal.addEventListener('shown.bs.modal', function () {
                    button.focus() ;
                });
            }
            button.addEventListener("click", ()=>{
                callbackCalled = true;
                bsModal.hide();
                resolve(choice.code) ;

            }) ;
            if(choice.isDefault){
                elModal.addEventListener('hidden.bs.modal', function () {
                    if(!callbackCalled){
                        //closed by ESC
                        callbackCalled = true;
                        resolve(choice.code) ;
                    }
                });
            }
        }) ;

        bsModal.show() ;
        elModal.addEventListener('hidden.bs.modal', ()=>{
            bsModal.dispose() ;
            document.body.removeChild(elModal) ;
            if(!callbackCalled){
                resolve() ;
            }
        })
    }) ;
} 

window.bootstrap5.dialogs.confirm = function ({message, title, headerClass, yesLabel, noLabel, focusToNoButton, backdrop, focus, keyboard, size, draggable, closeable}) {
    return window.bootstrap5.dialogs.question({
        message, title, headerClass, backdrop, focus, keyboard, size, draggable, closeable,
        choices: [
            {label : noLabel??"No", code: false, className: "btn-secondary", focus: focusToNoButton, isDefault: true},
            {label : yesLabel??"Yes", code: true, className: "btn-primary", focus: !focusToNoButton}
        ], 
    });
}