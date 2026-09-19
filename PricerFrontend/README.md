mvn.cmd -f "C:\Users\frede\VSCode\Finance\Pricer\pom.xml" spring-boot:run

Government bond : Obligation d'État.Treasury bond (T-bond) : Obligation du Trésor américain (long terme).Corporate bond : Obligation d'entreprise.Municipal bond : Obligation municipale (aux États-Unis).Zero-coupon bond : Obligation zéro-coupon (sans versement d'intérêts périodiques).Convertible bond : Obligation convertible (en actions).High-yield bond : Obligation à haut rendement (ou junk bond / obligation pourrie).

Introduction to Fixed Income
  The Basics Of Bonds
  Interest Rates, Inflation, And Bonds
Types of Fixed Income
  Government Bond
  Treasury Bond (T-Bond)
  Bonds vs. Notes vs. Bills
  Treasury Inflation-Protected Securities (TIPS)
  Municipal Bond
  Corporate Bond
  Convertible Bond
  High-Yield Bond
  Junk Bond
  Callable Bond
Understanding Fixed Income
  Bond Market vs. Stock Market
  Cash vs. Bonds
  Money Market vs. Short-Term Bonds
  The Secondary Market: "Over the Counter"
  Zero-coupon Bond vs. a Regular Bond


Le prix P s'exprime ainsi :\(P=\sum _{t=1}^{N}\frac{Cpn}{(1+i)^{t}}+\frac{Nom}{(1+i)^{N}}\)Cpn : Montant du coupon périodique (Valeur nominale × taux facial).Nom : Valeur nominale (remboursement du principal à l'échéance).i : Taux d'actualisation ou rendement actuariel de l'obligation.N : Nombre de périodes restantes avant l'échéance.

obligation standard :Valeur nominale (Nom) : 1 000 €Taux facial (annuel) : 5 % (soit un coupon Cpn de 50 € par an)Maturité (N) : 3 ansTaux de rendement du marché (i) : 4 %Flux actualisés chaque année :Année 1 : \(\frac{50}{(1 + 0,04)^1} = 48,08\text{ €}\)Année 2 : \(\frac{50}{(1 + 0,04)^2} = 46,23\text{ €}\)Année 3 (coupon + nominal) : \(\frac{50 + 1000}{(1 + 0,04)^3} = 934,58\text{ €}\)Prix total de l'obligation : \(48,08 + 46,23 + 934,58 = \mathbf{1\,028,89\text{ €}}\)(L'obligation se négocie au-dessus du nominal car son taux facial de 5% est supérieur au taux du marché de 4%).Si vous le souhaitez, précisez-moi :Le taux facial et le prix d'achat viséLa fréquence des coupons (annuelle, semestrielle)Je peux vous calculer le taux de rendement actuariel (YTM) exact ou la sensibilité de l'obligation.

https://www.calculator.net/bond-calculator.html

Bond Calculator
Please enter any four values into the fields below to calculate the remaining value of a bond. This calculator is for bonds issued/traded at the coupon date.

Price	
Face value	
100
Yield	
6
Time to maturity
3
years
Annual coupon	
5

%
Coupon frequency	
annually
 
ResultsSave this calculation
Given the face value, yield, time to maturity, and annual coupon, the price is: $97.3270.


Bond pricing calculator
Use this calculator to value the price of bonds not traded at the coupon date. It provides the dirty price, clean price, accrued interest, and the days since the last coupon payment.

Face value	
100
Yield	
6
Annual coupon	
5

%
Coupon frequency	
annually
Maturity date ?	
16/09/2029
Settlement date ?	
19/09/2026
Day-count convention to use:?
 
ResultsSave this calculation
Dirty price:	$97.3743
Clean price:	$97.3326
Accrued interest:	$0.0417
Interest accrued days:	3
Related
Investment Calculator | Interest Calculator | Loan Calculator

The first calculator above is designed to compute various parameters of a fixed-rate coupon bond issued or traded on the coupon date. The second calculator is used to determine the prices and accrued interest of fixed-rate bonds not traded on the coupon date using common day-count conventions. It is important to note that these calculators are specifically intended for use with fixed-rate coupon bonds, which represent the majority of bond types. Additionally, it should be mentioned that in pricing bonds, these calculators do not account for other factors that can influence bond prices, such as credit quality, supply and demand, and numerous other factors.

What is a bond?
A bond is a fixed-income instrument that represents a loan made by an investor to a borrower (typically a corporation or government entity). It serves as a means for organizations or governments to raise funds by borrowing from investors. A bond specifies the terms of the loan and the payments to be made to the bondholder.

Bonds come in various types to cater to the diverse needs of both investors and issuers. Each type comes with its own unique characteristics, risks, and benefits. The most common types include government bonds, municipal bonds, corporate bonds, and high-yield (junk) bonds, among others.

Relative to stocks, bonds are considered a lower-risk investment, making them a popular choice among investors seeking a stable income stream while preserving capital. However, the risk and return on bonds can vary widely, depending on the creditworthiness of the issuer and the bond's duration. For example, high-quality government bonds (such as U.S. Treasury bonds) are typically viewed as safe investments while high-yield corporate bonds (also known as junk bonds) carry higher risk.

Bond structure
The structure of a bond refers to its various components and characteristics, which dictate how it functions as a financial instrument. Here's a breakdown of the key elements in the structure of a bond:

Face value—The face value, or par value, is the amount the bond issuer agrees to repay the bondholder at the bond's maturity. This amount also serves as the basis for calculating interest/coupon payments.
Maturity date—The maturity date is the point when the bond's principal is due for repayment to the bondholder. Bonds can have short, medium, or long-term maturities spanning from less than a year to over 30 years. The term "time to maturity" refers to the remaining period until the bond reaches its maturity date.
Coupon rate—The coupon rate is the interest rate the bond issuer commits to paying on the bond's face value. Interest is typically paid annually or semi-annually. Rates can be fixed, floating (adjustable), or zero (as in zero-coupon bonds). The calculators above are designed exclusively for bonds with fixed coupon rates.
Coupon payment frequency—This refers to how often interest payments are made to bondholders. Common frequencies for interest or dividend payments include annual, semi-annual, quarterly, and monthly schedules.
Yield—The yield is a measure of the return an investor anticipates earning if the bond is held to maturity. Expressed as an annual percentage, the yield is affected by the bond's purchase price, face value, coupon rate, and the time until maturity. There are several types of yields that investors consider. The yield referred to in the above calculators is the current yield, which assesses the bond's coupon interest in relation to its current market price, rather than its face value. The current yield is calculated by dividing the annual coupon payment by the bond's current market price. This yield changes as the market price of the bond changes.
Price—The price of a bond is the amount it can be bought or sold for in the financial markets. In essence, a bond's price reflects the present value of its future coupon payments and the return of principal at maturity, adjusted for the bond's credit risk, duration, and the current interest rate environment.
Beyond these core components, features such as the issuer, call and put options, credit rating, covenants, and marketability also play important roles in a bond's valuation.

How to calculate the bond price?
Calculating the bond price involves discounting the future cash flows, which include interest payments and the principal repayment, to their present value using the required yield or discount rate. The bond price is the sum of the present values of all these cash flows. The basic formula for calculating the price of a bond is as follows:

bond price formula

where:

C = the coupon payment per period,
N = number of periods until maturity,
r = the discount rate or yield per period,
F = the face value of the bond.

Example:

Let's say we have a bond with a face value of $1,000, a coupon rate of 5%, semi-annual payments, a maturity of 10 years, and we require a yield of 6%.

Coupon payment per period (C) = 5% of $1,000 / 2 = $25
Number of periods (N) = 10 years × 2 = 20 periods
Discount rate per period (r) = 6% / 2 = 3% or 0.03

The bond price is calculated by discounting each semi-annual payment and the face value at maturity back to their present value, using a 3% per period rate. For this case, the calculated bond price is $925.61. This process involves performing calculations for each payment and then summing them up, a task that can be complex without the aid of a financial calculator or software. Our calculators above are designed to facilitate this purpose.

Clean price and dirty price
When calculating the price or present value of a bond, it is often assumed that the bond trades or is issued on the coupon date. However, in reality, bonds are mostly traded outside of the coupon dates. In the bond market, the terms 'clean price' and 'dirty price' are used to distinguish between two ways of quoting the price of a bond outside the coupon date. These concepts are crucial for understanding how bonds are traded and priced.

Accrued interest
Accrued interest of a bond is the interest that has accumulated on the bond since the last interest payment date but has not yet been paid to the bondholder. The accrued interest can be calculated using the formula:

accrued interest formula

Clean price
The clean price of a bond is the price that excludes any accrued interest since the last coupon payment. When bonds are quoted in financial markets and to the public, the clean price is typically used. This price reflects the market value of the bond itself, without considering any accrued interest. The clean price is useful because it provides a standard way to compare the prices of different bonds without the variability introduced by differing interest accrual periods.

Dirty price (invoice price)
The dirty price of a bond, also known as the invoice price, is the price that includes the accrued interest on top of the clean price. The dirty price is the actual amount paid by a buyer to the seller of the bond. Since bondholders earn interest on a daily basis, if a bond is bought or sold between coupon payment dates, the buyer compensates the seller for the interest income earned from the last coupon date up to the purchase date. This makes the dirty price a more accurate reflection of the bond's total value at any given point in time between coupon payments.

Based on the definitions above, the relationship between clean and dirty prices can be summarized as:

dirty price = clean price + accrued interest

This formula highlights that the dirty price, which is the total price paid by the buyer, includes both the clean price of the bond (its market value excluding accrued interest) and the accrued interest earned on the bond from the last coupon payment date up to the purchase date.

Day-count conventions
As seen in the accrued interest calculation formula above, the accrued interest is closely related to the methods of counting the number of days since the last coupon payment and the total days in a year. Day-count conventions in the bond market are rules that determine how days are counted for the calculation of interest that accrues over time on bonds. The main day-count conventions used in the bond market include:

30/360 (bond basis): This convention assumes that each month has 30 days and a year has 360 days. It simplifies interest calculations by standardizing the lengths of months, making it easier to calculate accrued interest manually. This convention is often used for corporate, agency, and municipal bonds in the United States.
Actual/360 (A/360): Here, the actual number of days in the accrual period is used, but the year is assumed to have 360 days. This convention is commonly used in money market instruments, such as commercial paper and short-term bank certificates of deposit.
Actual/365 (A/365): This method uses the actual number of days in the accrual period but assumes a fixed year length of 365 days (although leap years, which have 366 days, are usually not accounted for). It is commonly used for some government bonds outside the United States and in some interest rate swaps.
Actual/Actual (A/A): This convention is used primarily for government bonds, including U.S. Treasury securities. It takes into account the actual number of days in the accrual period and the actual number of days in the year, making it the most precise.
Different bonds may use different day-count conventions. The choice of day-count convention affects the calculation of accrued interest and, therefore, the price of the bond when it is traded between coupon dates. The second calculator above gives the option to select the day-count convention to use in the calculation. The accrued interest differences between different day-count conventions are normally very small. In extreme cases, it can have a difference of up to 6 days of accrued interest.
