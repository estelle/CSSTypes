/* js for CSS types */

const showResultsBtn = document.getElementById("showResults");
const resultsSection = document.querySelector("section");
const selection = document.getElementById("select")

showResultsBtn.addEventListener("click", function(e) {
    if(selection.value === "line-style") {
        resultsSection.style.display = "block";
    }
});