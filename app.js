function white() {
    document.getElementById("rice-white-amount").value = 1;
    document.getElementById("home").style.display = "none";
    document.getElementById("white-rice").style.display = "block";
}
function loadContactForm() 
{
    document.getElementById("home").style.display = "none";
    document.getElementById("contact-form").style.display = "block";
}
function gohome() {
    document.getElementById("home").style.display = "block";
    document.getElementById("white-rice").style.display = "none";
    document.getElementById("california-rice").style.display = "none";
}
function updatewhite() {
    var x = document.getElementById("rice-white-amount").value;

    var text = "Combine " + x * 1 + " cup of rice with " + x * 2 + " cups of water and 1 Tbsp olive oil. Bring to a boil, then reduce heat to the lowest setting. Cook for about 18 minutes.";

    document.getElementById("instruct-white").innerHTML = text;
}
function updatecal() {
    var x = document.getElementById("rice-cal-amount").value;

    var text = "Combine " + x* 1.25 + " cups of rice with " +  x*2 + " cups of water or broth and " + 1 + " Tbsp olive oil.Bring to a boil and stir once to mix.Reduce heat to low, cover with a tight - fitting lid and cook for 25 minutes.Remove from heat and let stand for 5 minutes.Fluff with a fork and serve.";

    document.getElementById("instruct-cal1").innerHTML = text;

    var text = "Increase liquid by " + x * 0.5 +  " cup and cook time by 5 minutes.";

    document.getElementById("instruct-cal2").innerHTML = text;
}
