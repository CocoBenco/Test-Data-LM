$(document).ready(function () {
    const $inputMessage = $('.message-input');
    const $sendButton = $('.send-button');
    const $chatContainer = $('.chat-container');
    const $resetButton = $('.reset-button');

    let recognition;
    if ('webkitSpeechRecognition' in window) {
     recognition = new webkitSpeechRecognition();
     recognition.continuous = true;
     recognition.interimResults = true;
        recognition.lang = 'fr-FR';
    } else {
    
     alert("La reconnaissance vocale n'est pas prise en charge dans ce navigateur.");
    }

    if (recognition) {
        recognition.onresult = function (event) {
            let interim_transcript = '';
            let final_transcript = '';
    
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    final_transcript += event.results[i][0].transcript;
                } else {
                    interim_transcript += event.results[i][0].transcript;
                }
            }
            $inputMessage.val(final_transcript + interim_transcript);
        };
    
        recognition.onerror = function (event) {
            console.error('Erreur de reconnaissance vocale: ' + event.error);
        };
    }
    

    let resetTimeoutId;
    let warningTimeoutId; 
    const inactiveTimeThreshold = 90000;
    const resetCountdownTime = 20000; 

    function createMessageElement(message, isUserMessage) {
        const $message = $('<div>').addClass('message').addClass(isUserMessage ? 'user-message' : 'ia-message');
        const $messageContent = $('<p>').text(message);
        $message.append($messageContent);
        return $message;
    }

    function scrollToBottom() {
        $chatContainer.scrollTop($chatContainer[0].scrollHeight);
    }
    

    function speakText(text) {
        const msg = new SpeechSynthesisUtterance();
        msg.text = text;
        window.speechSynthesis.speak(msg);
    }
    
    function isChatScrolledToBottom() {
        return $chatContainer[0].scrollHeight - $chatContainer.scrollTop() <= $chatContainer.outerHeight() + 10; 
    }    
    

    function appendMessage(message, isUserMessage) {
        const wasScrolledToBottom = isChatScrolledToBottom();
    
        const $message = createMessageElement(message, isUserMessage);
        $chatContainer.append($message);
    
        if (wasScrolledToBottom) {
            scrollToBottom();
        }
    }
    
    

    function animateMessage(message, isUserMessage) {
        const $message = createMessageElement('', isUserMessage);
        $chatContainer.append($message);
        scrollToBottom();
    
        let currentCharIndex = 0;
        const typingIntervalId = setInterval(function () {
            const currentText = message.slice(0, currentCharIndex + 1);
            $message.find('p').text(currentText);
            scrollToBottom();
    
            currentCharIndex++;
            if (currentCharIndex >= message.length) {
                clearInterval(typingIntervalId);
            }
        }, 20);
    }
    

    function handleMessageSubmission() {
        clearTimeout(resetTimeoutId); 

        const message = $inputMessage.val().trim();
        if (message) {
            $inputMessage.val(''); 
            appendMessage(message, true);

            const conversation_history = [];
            $('.message').each(function () {
                const isUserMessage = $(this).hasClass('user-message');
                conversation_history.push($(this).text());
            });

            $.ajax({
                type: 'POST',
                url: '/chat_with_ai',
                contentType: 'application/json',
                data: JSON.stringify({ conversation_history }),
                success: function (response) {
                    animateMessage(response.ai_response, false);
                    speakText(response.ai_response);
                    resetTimeout(); 
                
                    if (response.product) {
                        const productName = response.product.name;
                        const productDetails = response.product.features;
                
                        const $productButton = $('<button>')
                            .addClass('product-button')
                            .text('Voir détails du produit')
                            .on('click', function() {
                                showModal(productName, productDetails);
                            });
                
                        const $productMessage = createMessageElement('', false).append($productButton);
                        $chatContainer.append($productMessage);
                        scrollToBottom();
                    }
                },                
                
                error: function (jqXHR, textStatus, errorThrown) {
                    console.error("Erreur AJAX:", textStatus, errorThrown);
                    alert('Erreur lors de la communication avec l\'IA.');
                },
                
            });
        }
    }

    function resetChat() {
        $chatContainer.empty();
        resetInputMessage(); 
    }

    function resetInputMessage() {
        $inputMessage.val('');
        $inputMessage.focus();
    }

    function resetTimeout() {
        clearTimeout(resetTimeoutId);
        resetTimeoutId = setTimeout(function () {
            if ($('.message').length > 0) {
                showResetWarning();
            }
        }, inactiveTimeThreshold);
    }

    function showResetWarning() {
        clearTimeout(resetTimeoutId);

        const $warningContainer = $('<div>').addClass('warning-container');
        const $warningMessage = $('<p>').text('Aucune activité détectée. Appuyez sur "Continuer" ou la discussion se réinitialisera');
        const $countdownMessage = $('<p>').text('Compte à rebours : ');
        const $countdownTimer = $('<span>').addClass('countdown-timer').text('20');
        const $continueButton = $('<button>').addClass('continue-button').text('Continuer');
        const $resetButtonWarning = $('<button>').addClass('reset-button-warning').text('Réinitialiser');
        $countdownMessage.append($countdownTimer);
        $warningContainer.append($warningMessage, $countdownMessage, $continueButton, $resetButtonWarning);
        $('body').append($warningContainer);

        let countdownValue = resetCountdownTime / 1000;

        const countdownIntervalId = setInterval(function () {
            countdownValue--;
            $countdownTimer.text(countdownValue);
            if (countdownValue <= 0) {
                clearInterval(countdownIntervalId);
                resetChat();
                $warningContainer.remove();
                resetTimeout();
            }
        }, 1000);

        $continueButton.on('click', function () {
            clearTimeout(resetTimeoutId);
            clearInterval(countdownIntervalId);
            $warningContainer.remove();
            resetTimeout();
        });

        $resetButtonWarning.on('click', function () {
            clearTimeout(resetTimeoutId);
            clearInterval(countdownIntervalId);
            resetChat();
            $warningContainer.remove();
        });
    }

    $sendButton.on('click', handleMessageSubmission);
    $inputMessage.on('keypress', function (event) {
        if (event.key === 'Enter') {
            event.preventDefault(); 
            handleMessageSubmission();
        }
    });

    $inputMessage.on('keydown', function () {
        clearTimeout(resetTimeoutId);
    });

    $resetButton.on('click', function () {
        resetChat();
        clearTimeout(resetTimeoutId);
    });

    const $voiceButton = $('.voice-button');

    if (recognition) {
        $voiceButton.mousedown(function () {
            recognition.start();
        });
        
        $voiceButton.mouseup(function () {
            recognition.stop();
            setTimeout(() => {
                handleMessageSubmission();
                $inputMessage.val(''); 
            }, 1000); 
        });
        
    } else {
        $voiceButton.hide(); 
    }
    
    resetTimeout();
    $inputMessage.focus();
    


var modal = document.getElementById("myModal");
var span = document.getElementsByClassName("close")[0];


function showModal(productName, productDetails) {
    modal.style.display = "block";
    modal.querySelector("h2").textContent = productName;
    modal.querySelector("p").textContent = productDetails;
}


span.onclick = function() {
    modal.style.display = "none";
}


window.onclick = function(event) {
    if (event.target == modal) {
        modal.style.display = "none";
    }
}


});