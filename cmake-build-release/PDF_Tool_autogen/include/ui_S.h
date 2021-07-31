/********************************************************************************
** Form generated from reading UI file 's.ui'
**
** Created by: Qt User Interface Compiler version 5.15.2
**
** WARNING! All changes made in this file will be lost when recompiling UI file!
********************************************************************************/

#ifndef UI_S_H
#define UI_S_H

#include <QtCore/QVariant>
#include <QtWidgets/QApplication>
#include <QtWidgets/QWidget>

QT_BEGIN_NAMESPACE

class Ui_S
{
public:

    void setupUi(QWidget *S)
    {
        if (S->objectName().isEmpty())
            S->setObjectName(QString::fromUtf8("S"));
        S->resize(400, 300);

        retranslateUi(S);

        QMetaObject::connectSlotsByName(S);
    } // setupUi

    void retranslateUi(QWidget *S)
    {
        S->setWindowTitle(QCoreApplication::translate("S", "S", nullptr));
    } // retranslateUi

};

namespace Ui {
    class S: public Ui_S {};
} // namespace Ui

QT_END_NAMESPACE

#endif // UI_S_H
